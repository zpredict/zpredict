//! Cross-language test vectors: `testdata/vectors.json` is read by the TS sdk tests.
//! Regenerate with `UPDATE_VECTORS=1 cargo test -p zpredict-core --test vectors`.

use zpredict_core::{MAX_SIZE, ORDER_LEN, Order, Side, clear, combine, fill_records, split};

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn order_json(o: &Order) -> String {
    format!(
        r#"{{"market": {}, "side": {}, "price": {}, "size": {}, "key": "{}", "hex": "{}"}}"#,
        o.market,
        o.side as u8,
        o.price,
        o.size,
        hex(&o.key),
        hex(&o.encode())
    )
}

fn vectors() -> String {
    let o = |market, side, price, size, key: u8| Order {
        market,
        side,
        price,
        size,
        key: std::array::from_fn(|i| key.wrapping_add(i as u8)),
    };
    let orders = [
        o(7, Side::Yes, 63, 10, 42),
        o(1, Side::No, 1, 1, 0),
        o(u32::MAX, Side::No, 99, MAX_SIZE, 0xf0),
        o(0x0102_0304, Side::Yes, 50, 0, 1),
    ];

    let plain = orders[0].encode();
    let r0: [u8; ORDER_LEN] = std::array::from_fn(|i| (i * 37 + 11) as u8);
    let r1: [u8; ORDER_LEN] = std::array::from_fn(|i| 0xff - i as u8);
    let shares = split(&plain, r0, r1);
    assert_eq!(combine(&shares), plain);

    let batch = [
        o(7, Side::Yes, 55, 4, 1),
        o(7, Side::Yes, 70, 2, 2),
        o(7, Side::No, 50, 5, 3),
        o(7, Side::No, 99, 0, 0),
    ];
    // Per-slot fill records; slot 2 (NO 5) crosses both YES orders at different midpoints.
    let records: Vec<String> = fill_records(&batch, &clear(&batch))
        .iter()
        .map(|r| format!("\"{}\"", hex(r)))
        .collect();

    let list = |v: Vec<String>| format!("[\n    {}\n  ]", v.join(",\n    "));
    format!(
        "{{\n  \"orders\": {},\n  \"split\": {{\"order\": \"{}\", \"r0\": \"{}\", \"r1\": \"{}\", \"shares\": [\"{}\", \"{}\", \"{}\"]}},\n  \"batch\": {},\n  \"records\": {}\n}}\n",
        list(orders.iter().map(order_json).collect()),
        hex(&plain),
        hex(&r0),
        hex(&r1),
        hex(&shares[0]),
        hex(&shares[1]),
        hex(&shares[2]),
        list(batch.iter().map(order_json).collect()),
        list(records)
    )
}

#[test]
fn vectors_match_file() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/testdata/vectors.json");
    let want = vectors();
    if std::env::var_os("UPDATE_VECTORS").is_some() {
        std::fs::create_dir_all(concat!(env!("CARGO_MANIFEST_DIR"), "/testdata")).unwrap();
        std::fs::write(path, &want).unwrap();
    }
    let have = std::fs::read_to_string(path).expect("run with UPDATE_VECTORS=1 to create");
    assert_eq!(
        have, want,
        "vectors.json is stale: rerun with UPDATE_VECTORS=1"
    );
}
