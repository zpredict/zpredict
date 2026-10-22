//! The market list beyond the config: hourly rolling markets ([`rolling`]) and the saved
//! list ([`saved`]) that keeps them and signed outcomes across restarts. The chain poller
//! (`chain.rs`) drives both.

mod rolling;
mod saved;

pub use rolling::{ROLLING_ID_BASE, Rolling};
pub use saved::{load, save};
