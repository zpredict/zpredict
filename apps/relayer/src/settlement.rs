//! Settlement hooks for `packages/settle`.
//!
//! - Inputs: [`crate::state::State::positions`] (this relayer's fill shares) and
//!   [`crate::state::State::credit`] (deposits, credited `(A, 0, 0)`).
//! - [`payout`] is the plaintext rule the payout MPC must match, like
//!   `zpredict_core::clear` is for the clearing circuit: the settle side combines the
//!   three relayers' shares inside MPC and gets the payout vector, never the positions.

use zpredict_core::{FILL_LEN, Side};

/// Half-ticks per unit of collateral; a winning contract pays one unit.
pub const HALF_TICKS_PER_UNIT: u64 = 200;

/// What one combined fill record pays once its market resolves to `outcome`, in
/// half-ticks: `size` units if it filled on the winning side, else nothing.
pub fn payout(record: &[u8; FILL_LEN], outcome: Side) -> u64 {
    let size = u32::from_le_bytes(record[0..4].try_into().expect("4 bytes"));
    let filled = record[9] & 1 == 1;
    if filled && record[8] == outcome as u8 {
        u64::from(size) * HALF_TICKS_PER_UNIT
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zpredict_core::{Order, clear, fill_records};

    #[test]
    fn winners_get_one_unit_per_contract() {
        let o = |side, price, size| Order {
            market: 7,
            side,
            price,
            size,
            account: 1,
        };
        let batch = [o(Side::Yes, 60, 3), o(Side::No, 45, 2), o(Side::No, 99, 0)];
        let r = fill_records(&batch, &clear(&batch));
        assert_eq!(payout(&r[0], Side::Yes), 2 * 200);
        assert_eq!(payout(&r[0], Side::No), 0);
        assert_eq!(payout(&r[1], Side::No), 2 * 200);
        assert_eq!(payout(&r[2], Side::No), 0, "dummies never pay");
        // Locked collateral covers the payout exactly: each pair locks one unit.
        let paid: u32 = r
            .iter()
            .map(|x| u32::from_le_bytes(x[4..8].try_into().unwrap()))
            .sum();
        assert_eq!(u64::from(paid), payout(&r[0], Side::Yes));
    }
}
