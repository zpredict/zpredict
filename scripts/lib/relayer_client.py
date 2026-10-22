"""A browser stand-in for scripts: XOR-shares orders and withdrawals to the three
relayers and combines their shares when reading back, as @zpredict/sdk does. The tag
(hex32) is the account's credential and never leaves whole.

  relayer_client.py order <tag> <market> <yes|no> <price> <size>   -> handle
  relayer_client.py fill <handle>                                   -> pending | <size> <cost> <side> <filled>
  relayer_client.py balance <tag>                                   -> half-ticks
  relayer_client.py withdraw <tag> <half-ticks> <unified address>   -> withdrawalId
  relayer_client.py forge <tag> <relayer> <half-ticks> <address>    -> withdrawalId
  relayer_client.py withdrawal <withdrawalId>                       -> <status> [txid]
  relayer_client.py outcome <market>                                -> yes | no | -

An order handle is `orderId.token0.token1.token2`: relayer i serves its fill share only
to the read token it got with the order, as the browser keeps them.

`forge` plays a malicious relayer: it knows the account id and its own key share (from
its deposit-memo slot), and asks for a withdrawal with only that. It must be refused.

RELAYERS lists the three relayer base URLs, space-separated, in party order.
"""
import hashlib
import json
import os
import secrets
import struct
import sys
import urllib.error
import urllib.request

URLS = os.environ["RELAYERS"].split()


def call(url, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url + path, data=data, method="POST" if data else "GET")
    req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def split(plain):
    r0, r1 = secrets.token_bytes(len(plain)), secrets.token_bytes(len(plain))
    return [r0, r1, bytes(a ^ b ^ c for a, b, c in zip(plain, r0, r1))]


def combine(hexes):
    out = bytes(len(hexes[0]) // 2)
    for h in hexes:
        out = bytes(a ^ b for a, b in zip(out, bytes.fromhex(h)))
    return out


def account_hex(tag):
    """The public account id (hex16, u64 LE), as zpredict_settle::memo::account_id."""
    return hashlib.blake2b(bytes.fromhex(tag), digest_size=8, person=b"zPredictAccount1").hexdigest()


def key_shares(tag):
    """Each relayer's deterministic share of the tag, as zpredict_settle::memo::key_shares."""
    t = bytes.fromhex(tag)
    s = [hashlib.blake2b(t + bytes([i]), digest_size=16, person=b"zPredictKeyShare").digest() for i in (0, 1)]
    return [s[0], s[1], bytes(a ^ b ^ c for a, b, c in zip(t, *s))]


def withdraw(shares, amount, address):
    wid = secrets.token_hex(16)
    bodies = [
        {"withdrawalId": wid, "share": s.hex(), "amount": int(amount), "address": address}
        for s in shares
    ]
    post_all("/withdrawals", bodies)
    return wid


def post_all(path, bodies):
    for url, body in zip(URLS, bodies):
        code, reply = call(url, path, body)
        if code != 202:
            sys.exit(f"{url}{path}: {code} {reply}")


def main(cmd, *args):
    if cmd == "order":
        tag, market, side, price, size = args
        side = {"yes": 0, "no": 1}[side]
        order = struct.pack("<IBBI", int(market), side, int(price), int(size)) + bytes.fromhex(tag)
        oid, tokens = secrets.token_hex(16), [secrets.token_hex(16) for _ in URLS]
        bodies = [{"orderId": oid, "share": s.hex(), "token": t} for s, t in zip(split(order), tokens)]
        post_all("/orders", bodies)
        print(".".join([oid, *tokens]))
    elif cmd == "fill":
        oid, *tokens = args[0].split(".")
        replies = [call(u, f"/orders/{oid}?token={t}")[1] for u, t in zip(URLS, tokens)]
        if any(r.get("status") != "filled" for r in replies):
            print("pending")
            return
        rec = combine([r["fillShare"] for r in replies])
        size, cost = struct.unpack("<II", rec[:8])
        print(size, cost, rec[8], rec[9] & 1)
    elif cmd == "balance":
        tag = args[0]
        paths = [f"/accounts/{account_hex(tag)}?key={k.hex()}" for k in key_shares(tag)]
        shares = [call(u, p)[1]["balanceShare"] for u, p in zip(URLS, paths)]
        print(struct.unpack("<Q", combine(shares))[0])
    elif cmd == "withdraw":
        tag, amount, address = args
        print(withdraw(split(bytes.fromhex(tag)), amount, address))
    elif cmd == "forge":
        tag, relayer, amount, address = args
        mine = key_shares(tag)[int(relayer)]
        print(withdraw([mine, bytes(16), bytes(16)], amount, address))
    elif cmd == "withdrawal":
        _, w = call(URLS[0], f"/withdrawals/{args[0]}")
        print(w.get("status", "unknown"), w.get("txid", ""))
    elif cmd == "outcome":
        _, markets = call(URLS[0], "/markets")
        m = next(m for m in markets if m["id"] == int(args[0]))
        print(m.get("outcome") or "-")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(*sys.argv[1:])
