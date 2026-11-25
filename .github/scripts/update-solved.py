#!/usr/bin/env python3
"""Update the LeetCode, Codeforces and CodeChef solved counts in the given files.

Any element with id="lc-solved", id="cf-solved" or id="cc-solved" gets the first number in its
text replaced with the current count, so the surrounding words can be anything.
If a site can't be reached, its count is left as it is.

Usage: python3 update-solved.py FILE [FILE ...]
"""

import json
import re
import sys
import urllib.request

USER = "shloksangwan"
HEADERS = {"User-Agent": "solved-count-updater", "Content-Type": "application/json"}


def get_json(url, data=None, extra_headers=None):
    headers = dict(HEADERS, **(extra_headers or {}))
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def leetcode_solved():
    query = "query($u:String!){matchedUser(username:$u){submitStatsGlobal{acSubmissionNum{difficulty count}}}}"
    data = get_json("https://leetcode.com/graphql", {"query": query, "variables": {"u": USER}},
                    {"Referer": "https://leetcode.com"})
    stats = data["data"]["matchedUser"]["submitStatsGlobal"]["acSubmissionNum"]
    return next(s["count"] for s in stats if s["difficulty"] == "All")


def codeforces_solved():
    data = get_json(f"https://codeforces.com/api/user.status?handle={USER}")
    if data.get("status") != "OK":
        raise RuntimeError(data.get("comment", "Codeforces API error"))
    # A problem counts once, however many accepted submissions it has
    return len({(s["problem"].get("contestId"), s["problem"]["index"])
                for s in data["result"] if s.get("verdict") == "OK"})


def codechef_solved():
    # CodeChef has no public API for this, so read the number from the profile page
    req = urllib.request.Request(f"https://www.codechef.com/users/{USER}",
                                 headers={"User-Agent": "Mozilla/5.0 (solved-count-updater)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        page = resp.read().decode("utf-8", "replace")
    match = re.search(r"Total Problems Solved:\s*(\d+)", page)
    if not match:
        raise RuntimeError("solved count not found on the CodeChef profile page")
    return int(match.group(1))


def main(paths):
    counts = {}
    for key, fetch in (("lc-solved", leetcode_solved), ("cf-solved", codeforces_solved),
                       ("cc-solved", codechef_solved)):
        try:
            counts[key] = fetch()
            print(f"{key}: {counts[key]}")
        except Exception as err:  # keep the old number rather than fail the whole run
            print(f"warning: could not fetch {key}: {err}", file=sys.stderr)

    for path in paths:
        with open(path, encoding="utf-8") as f:
            text = original = f.read()
        for key, count in counts.items():
            pattern = re.compile(r'(<(\w+)\b[^>]*\bid="%s"[^>]*>)([^<]*)(</\2>)' % key)
            text = pattern.sub(lambda m: m.group(1) + re.sub(r"\d+", str(count), m.group(3), count=1) + m.group(4), text)
        if text != original:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            print(f"updated {path}")


if __name__ == "__main__":
    main(sys.argv[1:])
