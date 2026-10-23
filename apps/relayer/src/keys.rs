//! Noise static keys: `zpredict-relayer keygen <prefix>` and loading them from config.

use std::path::Path;

use snow::Builder;

use crate::error::{Error, Result};
use crate::peers::PATTERN;

/// Writes a fresh key pair to `<prefix>.key` (private, mode 0600) and `<prefix>.pub`.
pub fn keygen(prefix: &Path) -> Result<String> {
    use std::os::unix::fs::OpenOptionsExt;
    let kp = Builder::new(PATTERN.parse()?).generate_keypair()?;
    let key = prefix.with_extension("key");
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&key)?;
    std::io::Write::write_all(&mut f, hex::encode(&kp.private).as_bytes())?;
    let public = hex::encode(&kp.public);
    std::fs::write(prefix.with_extension("pub"), &public)?;
    Ok(public)
}

pub fn read_key(path: &Path) -> Result<[u8; 32]> {
    let text = std::fs::read_to_string(path)?;
    let mut k = [0u8; 32];
    hex::decode_to_slice(text.trim(), &mut k)
        .map_err(|_| Error::Config(format!("{} is not a 32-byte hex key", path.display())))?;
    Ok(k)
}

#[cfg(test)]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    #[test]
    fn keygen_is_private_and_never_overwrites() {
        let dir = crate::store::tests::temp_dir("keygen");
        std::fs::create_dir_all(&dir).unwrap();
        let prefix = dir.join("r0");
        let public = keygen(&prefix).unwrap();
        let key = prefix.with_extension("key");
        assert_eq!(
            std::fs::metadata(&key).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            hex::encode(read_key(&prefix.with_extension("pub")).unwrap()),
            public
        );
        read_key(&key).unwrap();
        assert!(
            keygen(&prefix).is_err(),
            "an existing key is never replaced"
        );
        std::fs::write(dir.join("bad"), "zz").unwrap();
        assert!(read_key(&dir.join("bad")).is_err());
    }
}
