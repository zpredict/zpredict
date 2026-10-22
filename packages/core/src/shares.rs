//! 3-way XOR secret sharing: one share per relayer, all three needed to rebuild.

use crate::ORDER_LEN;

/// Split with caller-supplied randomness: `r0`, `r1` must be uniformly random.
pub fn split(
    order: &[u8; ORDER_LEN],
    r0: [u8; ORDER_LEN],
    r1: [u8; ORDER_LEN],
) -> [[u8; ORDER_LEN]; 3] {
    let mut s2 = *order;
    for i in 0..ORDER_LEN {
        s2[i] ^= r0[i] ^ r1[i];
    }
    [r0, r1, s2]
}

pub fn combine(shares: &[[u8; ORDER_LEN]; 3]) -> [u8; ORDER_LEN] {
    let mut b = [0u8; ORDER_LEN];
    for s in shares {
        for i in 0..ORDER_LEN {
            b[i] ^= s[i];
        }
    }
    b
}
