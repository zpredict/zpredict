//! A polytune [`Channel`] over plain TCP, one connection per pair of parties.
//!
//! ponytail: no TLS or peer authentication; any host that reaches the port can claim a
//! party id. Fine on localhost and for the demo's private network; put mTLS in front
//! (or swap the stream type) before the relayers talk over the internet.

use std::{io, net::SocketAddr, time::Duration};

use polytune::channel::Channel;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream, tcp::OwnedWriteHalf},
    sync::{
        Mutex,
        mpsc::{UnboundedReceiver, unbounded_channel},
    },
    time::sleep,
};

const DIAL_ATTEMPTS: usize = 600; // 2 minutes at 200 ms: peers start in any order

/// Length-prefixed frames to each peer. A background task per peer drains its socket
/// into a queue, so two parties sending large messages at once never deadlock.
pub struct TcpChannel {
    tx: Vec<Option<Mutex<OwnedWriteHalf>>>,
    rx: Vec<Option<Mutex<UnboundedReceiver<Vec<u8>>>>>,
}

impl TcpChannel {
    /// Listens on `peers[party]`, dials every higher-indexed party and accepts every
    /// lower-indexed one. Must run inside a Tokio runtime.
    pub async fn connect(party: usize, peers: &[SocketAddr]) -> io::Result<Self> {
        let listener = TcpListener::bind(peers[party]).await?;
        let mut streams: Vec<Option<TcpStream>> = peers.iter().map(|_| None).collect();
        for (p, addr) in peers.iter().enumerate().skip(party + 1) {
            let mut s = dial(*addr).await?;
            s.write_u8(party as u8).await?;
            streams[p] = Some(s);
        }
        for _ in 0..party {
            let (mut s, _) = listener.accept().await?;
            let p = s.read_u8().await? as usize;
            if p >= party || streams[p].is_some() {
                return Err(io::Error::new(io::ErrorKind::InvalidData, "bad peer id"));
            }
            streams[p] = Some(s);
        }
        let (mut tx, mut rx) = (Vec::new(), Vec::new());
        for s in streams {
            let Some(s) = s else {
                tx.push(None);
                rx.push(None);
                continue;
            };
            s.set_nodelay(true)?;
            let (mut r, w) = s.into_split();
            let (q_tx, q_rx) = unbounded_channel();
            tokio::spawn(async move {
                while let Ok(len) = r.read_u32_le().await {
                    let mut buf = vec![0; len as usize];
                    if r.read_exact(&mut buf).await.is_err() || q_tx.send(buf).is_err() {
                        break;
                    }
                }
            });
            tx.push(Some(Mutex::new(w)));
            rx.push(Some(Mutex::new(q_rx)));
        }
        Ok(Self { tx, rx })
    }
}

async fn dial(addr: SocketAddr) -> io::Result<TcpStream> {
    for _ in 1..DIAL_ATTEMPTS {
        if let Ok(s) = TcpStream::connect(addr).await {
            return Ok(s);
        }
        sleep(Duration::from_millis(200)).await;
    }
    TcpStream::connect(addr).await
}

fn no_peer(p: usize) -> io::Error {
    io::Error::new(io::ErrorKind::NotFound, format!("no channel to party {p}"))
}

impl Channel for TcpChannel {
    type SendError = io::Error;
    type RecvError = io::Error;

    async fn send_bytes_to(&self, p: usize, data: Vec<u8>, _phase: &str) -> io::Result<()> {
        let len = u32::try_from(data.len()).map_err(io::Error::other)?;
        let mut w = self.tx[p].as_ref().ok_or_else(|| no_peer(p))?.lock().await;
        w.write_u32_le(len).await?;
        w.write_all(&data).await
    }

    async fn recv_bytes_from(&self, p: usize, _phase: &str) -> io::Result<Vec<u8>> {
        let mut r = self.rx[p].as_ref().ok_or_else(|| no_peer(p))?.lock().await;
        r.recv()
            .await
            .ok_or_else(|| io::Error::new(io::ErrorKind::UnexpectedEof, "peer closed"))
    }
}
