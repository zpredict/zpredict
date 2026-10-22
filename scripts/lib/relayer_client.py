"""A browser stand-in for scripts: XOR-shares orders and withdrawals to the three
relayers and combines their shares when reading back, as @zpredict/sdk does.

  relayer_client.py order <tag> <market> <yes|no> <price> <size>   -> orderId
  relayer_client.py fill <orderId>                                  -> pending | <size> <cost> <side> <filled>
  relayer_client.py balance <tag>                                   -> half-ticks
  relayer_client.py withdraw <tag> <half-ticks> <unified address>   -> withdrawalId
  relayer_client.py withdrawal <withdrawalId>                       -> <status> [txid]
  relayer_client.py outcome <market>                                -> yes | no | -

RELAYERS lists the three relayer base URLs, space-separated, in party order.
"""
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


def account(tag):
    return bytes.fromhex(tag)[:8]


def post_all(path, bodies):
    for url, body in zip(URLS, bodies):
        code, reply = call(url, path, body)
        if code != 202:
            sys.exit(f"{url}{path}: {code} {reply}")


def main(cmd, *args):
    if cmd == "order":
        tag, market, side, price, size = args
        side = {"yes": 0, "no": 1}[side]
        order = struct.pack("<IBBI", int(market), side, int(price), int(size)) + account(tag)
        oid = secrets.token_hex(16)
        post_all("/orders", [{"orderId": oid, "share": s.hex()} for s in split(order)])
        print(oid)
    elif cmd == "fill":
        replies = [call(u, f"/orders/{args[0]}")[1] for u in URLS]
        if any(r.get("status") != "filled" for r in replies):
            print("pending")
            return
        rec = combine([r["fillShare"] for r in replies])
        size, cost = struct.unpack("<II", rec[:8])
        print(size, cost, rec[8], rec[9] & 1)
    elif cmd == "balance":
        shares = [call(u, f"/accounts/{args[0]}")[1]["balanceShare"] for u in URLS]
        print(struct.unpack("<Q", combine(shares))[0])
    elif cmd == "withdraw":
        tag, amount, address = args
        wid = secrets.token_hex(16)
        bodies = [
            {"withdrawalId": wid, "share": s.hex(), "amount": int(amount), "address": address}
            for s in split(account(tag))
        ]
        post_all("/withdrawals", bodies)
        print(wid)
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
