//! Authenticated links between the three relayers: Noise `KK` over TCP.
//!
//! Each relayer has a static X25519 key pair (`zpredict-relayer keygen`); every relayer's
//! config lists all three public keys. `KK` means both sides know each other's static key
//! up front, so a handshake only completes with the expected peer, and everything after
//! it (batch coordination and the whole MPC) is encrypted and authenticated with
//! ChaCha20-Poly1305. The dialer sends its party index in the clear first so the
//! acceptor picks the right key; a wrong claim just fails the handshake.
//!
//! Like the circuit's `TcpChannel`, party `i` dials every higher party and accepts every
//! lower one, and a reader task per link drains the socket into a queue so two parties
//! sending large messages at once never deadlock.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use snow::{Builder, HandshakeState, StatelessTransportState};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::OwnedWriteHalf;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};
use tokio::time::{Instant, sleep, timeout_at};

use crate::error::{Error, Result};

pub(crate) const PATTERN: &str = "Noise_KK_25519_ChaChaPoly_BLAKE2s";
/// Largest Noise message is 65535 bytes: minus the 16-byte tag and our 1-byte flag.
const CHUNK: usize = 65535 - 16 - 1;

/// One encrypted, authenticated link to a peer.
struct Link {
    tx: Mutex<(OwnedWriteHalf, u64)>,
    rx: Mutex<UnboundedReceiver<Vec<u8>>>,
    noise: Arc<StatelessTransportState>,
}

/// A full mesh for one batch: `links[p]` is the link to party `p` (`None` for self).
pub struct Links {
    pub party: usize,
    links: [Option<Link>; 3],
}

impl Links {
    fn link(&self, p: usize) -> Result<&Link> {
        self.links
            .get(p)
            .and_then(Option::as_ref)
            .ok_or_else(|| Error::Peer(format!("no link to {p}")))
    }

    pub async fn send(&self, p: usize, data: &[u8]) -> Result<()> {
        let link = self.link(p)?;
        let mut tx = link.tx.lock().await;
        let mut chunks = data.chunks(CHUNK).peekable();
        let mut frame = vec![0u8; 65535];
        let mut plain = Vec::with_capacity(CHUNK + 1);
        loop {
            let chunk = chunks.next().unwrap_or(&[]);
            plain.clear();
            plain.push(u8::from(chunks.peek().is_some()));
            plain.extend_from_slice(chunk);
            let n = link.noise.write_message(tx.1, &plain, &mut frame)?;
            tx.1 += 1;
            tx.0.write_u16(n as u16).await?;
            tx.0.write_all(&frame[..n]).await?;
            if chunks.peek().is_none() {
                return Ok(());
            }
        }
    }

    pub async fn recv(&self, p: usize) -> Result<Vec<u8>> {
        let mut rx = self.link(p)?.rx.lock().await;
        rx.recv()
            .await
            .ok_or_else(|| Error::Peer(format!("party {p} closed the link")))
    }
}

/// Listens for lower-indexed peers and dials higher-indexed ones.
pub struct Peering {
    party: usize,
    addrs: [SocketAddr; 3],
    private: [u8; 32],
    public: [[u8; 32]; 3],
    accepted: [Mutex<UnboundedReceiver<Link>>; 3],
    accept_tx: [UnboundedSender<Link>; 3],
}

impl Peering {
    pub fn new(
        party: usize,
        addrs: [SocketAddr; 3],
        private: [u8; 32],
        public: [[u8; 32]; 3],
    ) -> Arc<Self> {
        let (a, b, c) = (
            unbounded_channel(),
            unbounded_channel(),
            unbounded_channel(),
        );
        Arc::new(Self {
            party,
            addrs,
            private,
            public,
            accept_tx: [a.0, b.0, c.0],
            accepted: [Mutex::new(a.1), Mutex::new(b.1), Mutex::new(c.1)],
        })
    }

    /// Accept loop; run it for the process lifetime.
    pub async fn listen(self: Arc<Self>) -> Result<()> {
        let listener = TcpListener::bind(self.addrs[self.party]).await?;
        loop {
            let (mut s, _) = listener.accept().await?;
            let me = self.clone();
            tokio::spawn(async move {
                let Ok(p) = s.read_u8().await.map(usize::from) else {
                    return;
                };
                if p >= me.party {
                    return;
                }
                let hs = me.builder(p).and_then(|b| Ok(b.build_responder()?));
                let handshake = tokio::time::timeout(Duration::from_secs(10), respond(&mut s, hs));
                if let Ok(Ok(noise)) = handshake.await {
                    let _ = me.accept_tx[p].send(spawn_link(s, noise));
                }
            });
        }
    }

    fn builder(&self, p: usize) -> Result<Builder<'_>> {
        Ok(Builder::new(PATTERN.parse()?)
            .local_private_key(&self.private)?
            .remote_public_key(&self.public[p])?)
    }

    /// Builds the full mesh, or fails once `deadline` passes. Returns which parties were
    /// reached alongside, for `/health`.
    pub async fn connect(&self, deadline: Instant) -> (Result<Links>, [bool; 3]) {
        let mut links: [Option<Link>; 3] = [None, None, None];
        let mut up = [false; 3];
        up[self.party] = true;
        let mut err = None;
        for p in (0..3).filter(|&p| p != self.party) {
            let got = if p > self.party {
                timeout_at(deadline, self.dial(p)).await
            } else {
                timeout_at(deadline, self.take_accepted(p)).await
            };
            match got {
                Ok(Ok(l)) => (links[p], up[p]) = (Some(l), true),
                Ok(Err(e)) => err = Some(e),
                Err(_) => err = Some(Error::Peer(format!("party {p} unreachable"))),
            }
        }
        let party = self.party;
        (err.map_or(Ok(Links { party, links }), Err), up)
    }

    async fn dial(&self, p: usize) -> Result<Link> {
        loop {
            if let Ok(mut s) = TcpStream::connect(self.addrs[p]).await {
                s.write_u8(self.party as u8).await?;
                let mut hs = self.builder(p)?.build_initiator()?;
                let mut buf = vec![0u8; 1024];
                let n = hs.write_message(&[], &mut buf)?;
                write_frame(&mut s, &buf[..n]).await?;
                let msg = read_frame(&mut s).await?;
                hs.read_message(&msg, &mut buf)?;
                return Ok(spawn_link(s, hs.into_stateless_transport_mode()?));
            }
            sleep(Duration::from_millis(200)).await;
        }
    }

    /// The newest link a lower peer opened; older ones are stale attempts.
    async fn take_accepted(&self, p: usize) -> Result<Link> {
        let mut rx = self.accepted[p].lock().await;
        let mut last = None;
        while let Ok(l) = rx.try_recv() {
            last = Some(l);
        }
        match last {
            Some(l) => Ok(l),
            None => rx
                .recv()
                .await
                .ok_or_else(|| Error::Peer("listener stopped".into())),
        }
    }
}

async fn respond(s: &mut TcpStream, hs: Result<HandshakeState>) -> Result<StatelessTransportState> {
    let mut hs = hs?;
    let mut buf = vec![0u8; 1024];
    let msg = read_frame(s).await?;
    hs.read_message(&msg, &mut buf)?;
    let n = hs.write_message(&[], &mut buf)?;
    write_frame(s, &buf[..n]).await?;
    Ok(hs.into_stateless_transport_mode()?)
}

async fn write_frame(s: &mut TcpStream, b: &[u8]) -> Result<()> {
    s.write_u16(b.len() as u16).await?;
    Ok(s.write_all(b).await?)
}

async fn read_frame<R: AsyncReadExt + Unpin>(s: &mut R) -> Result<Vec<u8>> {
    let len = s.read_u16().await?;
    let mut b = vec![0u8; len as usize];
    s.read_exact(&mut b).await?;
    Ok(b)
}

/// Starts the reader task: decrypts frames, reassembles messages, queues them.
fn spawn_link(s: TcpStream, noise: StatelessTransportState) -> Link {
    let _ = s.set_nodelay(true);
    let noise = Arc::new(noise);
    let (mut r, w) = s.into_split();
    let (q_tx, q_rx) = unbounded_channel();
    let n = noise.clone();
    tokio::spawn(async move {
        let (mut nonce, mut msg, mut plain) = (0u64, Vec::new(), vec![0u8; 65535]);
        while let Ok(frame) = read_frame(&mut r).await {
            let Ok(len) = n.read_message(nonce, &frame, &mut plain) else {
                break;
            };
            let Some((&more, data)) = plain[..len].split_first() else {
                break;
            };
            nonce += 1;
            msg.extend_from_slice(data);
            if more == 0 && q_tx.send(std::mem::take(&mut msg)).is_err() {
                break;
            }
        }
    });
    Link {
        tx: Mutex::new((w, 0)),
        rx: Mutex::new(q_rx),
        noise,
    }
}
