//! Orders and their 26-byte wire encoding, shared with the browser sdk.

use crate::{Key, MAX_SIZE, ORDER_LEN, TICKS};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Yes = 0,
    No = 1,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Order {
    pub market: u32,
    pub side: Side,
    /// 1..=99 ticks: the most this order pays per contract for its side.
    pub price: u8,
    /// Contracts, at most [`MAX_SIZE`]; 0 marks a dummy order used to pad a batch.
    pub size: u32,
    /// The account's key: the order spends from the row holding this key.
    pub key: Key,
}

impl Order {
    /// Little-endian layout: market(4) side(1) price(1) size(4) key(16).
    /// The browser must produce exactly these bytes.
    pub fn encode(&self) -> [u8; ORDER_LEN] {
        let mut b = [0u8; ORDER_LEN];
        b[0..4].copy_from_slice(&self.market.to_le_bytes());
        b[4] = self.side as u8;
        b[5] = self.price;
        b[6..10].copy_from_slice(&self.size.to_le_bytes());
        b[10..26].copy_from_slice(&self.key);
        b
    }

    /// Rejects anything the circuit would treat as malformed.
    pub fn decode(b: &[u8; ORDER_LEN]) -> Option<Self> {
        let side = match b[4] {
            0 => Side::Yes,
            1 => Side::No,
            _ => return None,
        };
        let price = b[5];
        let size = u32::from_le_bytes(b[6..10].try_into().unwrap());
        if price == 0 || price as u16 >= TICKS || size > MAX_SIZE {
            return None;
        }
        Some(Self {
            market: u32::from_le_bytes(b[0..4].try_into().unwrap()),
            side,
            price,
            size,
            key: b[10..26].try_into().unwrap(),
        })
    }
}

/// Market 7, key `[42; 16]`: the fixture every unit test builds batches from.
#[cfg(test)]
pub(crate) fn test_order(side: Side, price: u8, size: u32) -> Order {
    Order {
        market: 7,
        side,
        price,
        size,
        key: [42; 16],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::order::test_order as o;
    use crate::shares::{combine, split};

    #[test]
    fn encode_roundtrip_and_shares() {
        let ord = o(Side::No, 37, 5);
        let b = ord.encode();
        let shares = split(&b, [0xA5; ORDER_LEN], [0x3C; ORDER_LEN]);
        assert_ne!(shares[2], b, "no single share equals the order");
        assert_eq!(Order::decode(&combine(&shares)), Some(ord));
    }

    #[test]
    fn decode_rejects_bad_side_and_price() {
        let mut b = o(Side::Yes, 50, 1).encode();
        b[4] = 2;
        assert_eq!(Order::decode(&b), None);
        let mut b = o(Side::Yes, 50, 1).encode();
        b[5] = 100;
        assert_eq!(Order::decode(&b), None);
        assert_eq!(
            Order::decode(&o(Side::Yes, 50, MAX_SIZE + 1).encode()),
            None
        );
    }
}
