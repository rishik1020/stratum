"""Run every backend test file.

    python run_tests.py

Each test module runs in its own process, because they set DATABASE_URL to a
throwaway database *before* importing the app — sharing an interpreter would
mean the first import wins and the rest quietly test the wrong database.

pytest works too if you have it (`pip install -r requirements-dev.txt`), but
isn't required — that's the point of this script.
"""
import os
import subprocess
import sys

TESTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tests")


def main() -> int:
    files = sorted(f for f in os.listdir(TESTS_DIR) if f.startswith("test_") and f.endswith(".py"))
    if not files:
        print("No test files found.")
        return 1

    failed = []
    for name in files:
        print(f"\n=== {name} " + "=" * (60 - len(name)))
        result = subprocess.run([sys.executable, os.path.join(TESTS_DIR, name)])
        if result.returncode != 0:
            failed.append(name)

    print("\n" + "=" * 66)
    if failed:
        print(f"FAILED: {', '.join(failed)}")
        return 1
    print(f"All {len(files)} test files passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
