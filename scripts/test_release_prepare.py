import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from release import proposal, report_publication


class PreparationTests(unittest.TestCase):
    def test_first_release_proposal_matches_the_planned_version(self):
        root = Path(__file__).resolve().parent.parent
        config = json.loads((root / "scripts/release.json").read_text())
        state = {"latest": None, "messages": ["feat: add release packaging"]}
        version, _ = proposal(root, config, state, None)
        self.assertEqual(version, "0.9.0")

    def test_project_release_reports_the_draft_review_step(self):
        root = Path(__file__).resolve().parent.parent
        config = json.loads((root / "scripts/release.json").read_text())
        with patch("sys.stdout", new_callable=io.StringIO) as output:
            report_publication(config, "v0.9.0")
        self.assertEqual(
            output.getvalue().splitlines(),
            [
                "Pushed v0.9.0. GitHub publication runs asynchronously.",
                "Workflow: https://github.com/nielsmadan/mouthfeel/actions/workflows/release.yml",
                "Draft releases (when ready): https://github.com/nielsmadan/mouthfeel/releases",
                "Review and publish the draft manually.",
            ],
        )

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
