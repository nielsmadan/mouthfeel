import json
import subprocess
import tempfile
import unittest
from pathlib import Path


class PreparationTests(unittest.TestCase):
    def test_manifest_and_lock_versions_agree_for_first_and_later_releases(self):
        root = Path(__file__).resolve().parent.parent
        config = json.loads((root / "scripts/release.json").read_text())
        package = json.loads((root / "package.json").read_text())
        with tempfile.TemporaryDirectory() as temporary:
            checkout = Path(temporary)
            for name in ["package.json", "package-lock.json"]:
                (checkout / name).write_bytes((root / name).read_bytes())
            for version in [package["version"], "9.8.7"]:
                with self.subTest(version=version):
                    command = [
                        argument.format(version=version)
                        for argument in config["stages"][0]["commands"][0]
                    ]
                    subprocess.run(command, cwd=checkout, capture_output=True, check=True)
                    updated = json.loads((checkout / "package.json").read_text())
                    lock = json.loads((checkout / "package-lock.json").read_text())
                    self.assertEqual(updated["version"], version)
                    self.assertEqual(lock["version"], version)
                    self.assertEqual(lock["packages"][""]["version"], version)


if __name__ == "__main__":
    unittest.main()
