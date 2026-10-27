//! One global drop per `interval` seconds and at most `cap` per UTC day. Global on
//! purpose: nothing is kept per caller, so there is nothing to tie a drop to an address.

const DAY: u64 = 86_400;

pub struct Limiter {
    interval: u64,
    cap: u32,
    next: u64,
    day: u64,
    used: u32,
}

impl Limiter {
    pub fn new(interval: u64, cap: u32) -> Self {
        Limiter {
            interval,
            cap,
            next: 0,
            day: 0,
            used: 0,
        }
    }

    fn roll(&mut self, now: u64) {
        if now / DAY != self.day {
            (self.day, self.used) = (now / DAY, 0);
        }
    }

    /// Seconds until the next drop may go out (0 = now).
    pub fn wait(&mut self, now: u64) -> u64 {
        self.roll(now);
        if self.used >= self.cap {
            (self.day + 1) * DAY - now
        } else {
            self.next.saturating_sub(now)
        }
    }

    pub fn left_today(&mut self, now: u64) -> u32 {
        self.roll(now);
        self.cap - self.used.min(self.cap)
    }

    /// Gives back a slot whose drop failed to send, the same UTC day only. The interval
    /// still applies, so a failing node is not hammered.
    pub fn refund(&mut self, now: u64) {
        self.roll(now);
        self.used = self.used.saturating_sub(1);
    }

    /// Takes the slot, or says how long to wait.
    pub fn take(&mut self, now: u64) -> Result<(), u64> {
        match self.wait(now) {
            0 => {
                self.next = now + self.interval;
                self.used += 1;
                Ok(())
            }
            w => Err(w),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interval_and_daily_cap() {
        let t = 100 * DAY;
        let mut l = Limiter::new(30, 2);
        assert_eq!(l.take(t), Ok(()));
        assert_eq!(l.take(t + 10), Err(20));
        assert_eq!(l.take(t + 30), Ok(()));
        assert_eq!(l.left_today(t + 30), 0);
        assert_eq!(
            l.take(t + 100),
            Err(DAY - 100),
            "cap: wait for the next UTC day"
        );
        assert_eq!(l.take(t + DAY), Ok(()), "a new day resets the count");
        assert_eq!(l.left_today(t + DAY), 1);
    }

    #[test]
    fn a_failed_send_gives_its_slot_back_that_day_only() {
        let t = 100 * DAY;
        let mut l = Limiter::new(30, 1);
        assert_eq!(l.take(t), Ok(()));
        l.refund(t + 1);
        assert_eq!(l.left_today(t + 1), 1, "refunded");
        assert_eq!(l.take(t + 1), Err(29), "the interval still holds");
        assert_eq!(l.take(t + 30), Ok(()));
        l.refund(t + DAY);
        assert_eq!(l.left_today(t + DAY), 1, "a new day is not over-credited");
    }
}
