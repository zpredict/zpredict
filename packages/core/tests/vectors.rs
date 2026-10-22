//! Cross-language test vectors: `testdata/vectors.json` is read by the TS sdk tests.
//! Regenerate with `UPDATE_VECTORS=1 cargo test -p zpredict-core --test vectors`.

use zpredict_core::{ORDER_LEN, Order, Side, clear, combine, split};

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn order_json(o: &Order) -> String {
    format!(
        r#"{{"market": {}, "side": {}, "price": {}, "size": {}, "account": "{}", "hex": "{}"}}"#,
        o.market,
        o.side as u8,
        o.price,
        o.size,
        o.account,
        hex(&o.encode())
    )
}

/// Fill share plaintext as the sdk decodes it: size u32 LE | cost u16 LE | side u8 | flags u8.
fn fill_hex(size: u32, cost: u16, side: Side) -> String {
    let mut b = size.to_le_bytes().to_vec();
    b.extend(cost.to_le_bytes());
    b.extend([side as u8, 1]);
    hex(&b)
}

fn vectors() -> String {
    let o = |market, side, price, size, account| Order {
        market,
        side,
        price,
        size,
        account,
    };
    let orders = [
        o(7, Side::Yes, 63, 10, 42),
        o(1, Side::No, 1, 1, 0),
        o(u32::MAX, Side::No, 99, u32::MAX, u64::MAX),
        o(0x0102_0304, Side::Yes, 50, 0, 0x0102_0304_0506_0708),
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
    let fills: Vec<String> = clear(&batch)
        .iter()
        .map(|f| {
            format!(
                r#"{{"yes": {}, "no": {}, "size": {}, "yesCost": {}, "noCost": {}, "yesFill": "{}", "noFill": "{}"}}"#,
                f.yes,
                f.no,
                f.size,
                f.yes_cost,
                f.no_cost,
                fill_hex(f.size, f.yes_cost, Side::Yes),
                fill_hex(f.size, f.no_cost, Side::No)
            )
        })
        .collect();

    let list = |v: Vec<String>| format!("[\n    {}\n  ]", v.join(",\n    "));
    format!(
        "{{\n  \"orders\": {},\n  \"split\": {{\"order\": \"{}\", \"r0\": \"{}\", \"r1\": \"{}\", \"shares\": [\"{}\", \"{}\", \"{}\"]}},\n  \"batch\": {},\n  \"fills\": {}\n}}\n",
        list(orders.iter().map(order_json).collect()),
        hex(&plain),
        hex(&r0),
        hex(&r1),
        hex(&shares[0]),
        hex(&shares[1]),
        hex(&shares[2]),
        list(batch.iter().map(order_json).collect()),
        list(fills)
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
