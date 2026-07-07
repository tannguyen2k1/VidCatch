import unittest

from fastapi import HTTPException

from app.core.security import validate_public_url


class SecurityValidationTests(unittest.TestCase):
    def test_rejects_localhost(self):
        with self.assertRaises(HTTPException):
            validate_public_url("http://localhost:8000/private")

    def test_rejects_private_ip(self):
        with self.assertRaises(HTTPException):
            validate_public_url("http://192.168.1.10/video.mp4")

    def test_rejects_non_http_scheme(self):
        with self.assertRaises(HTTPException):
            validate_public_url("file:///etc/passwd")


if __name__ == "__main__":
    unittest.main()
