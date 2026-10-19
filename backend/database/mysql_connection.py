import logging
import ssl
from typing import Any

# mysql-connector-python 26.7.0 still references the legacy PROTOCOL_TLSv1*
# constants that were removed in Python 3.14. The application does not request
# a legacy TLS version, so provide the removed names before importing it.
for _tls_protocol in ("PROTOCOL_TLSv1", "PROTOCOL_TLSv1_1", "PROTOCOL_TLSv1_2"):
    if not hasattr(ssl, _tls_protocol):
        setattr(ssl, _tls_protocol, ssl.PROTOCOL_TLS)

import mysql.connector
from mysql.connector import Error

from backend.config import MYSQL_CONFIG

# 获取日志记录器
logger = logging.getLogger(__name__)


class MySQLConnection:
    def __init__(self):
        self.host = MYSQL_CONFIG["host"]
        self.user = MYSQL_CONFIG["user"]
        self.password = MYSQL_CONFIG["password"]
        self.database = MYSQL_CONFIG["database"]
        self.port = MYSQL_CONFIG["port"]
        self.connection: Any | None = None
        self.cursor: Any | None = None

    def connect(self):
        try:
            self.connection = mysql.connector.connect(
                host=self.host,
                user=self.user,
                password=self.password,
                database=self.database,
                port=self.port,
            )
            if self.connection.is_connected():
                self.cursor = self.connection.cursor()
                return True
        except Error as e:
            logger.error(f"Error connecting to MySQL database: {e}")
            return False

    def disconnect(self):
        if self.connection and self.connection.is_connected():
            if self.cursor:
                self.cursor.close()
            self.connection.close()

    def execute_query(self, query, params=None):
        try:
            if not self.connection or not self.connection.is_connected():
                self.connect()
            if not self.connection or not self.cursor:
                return False
            self.cursor.execute(query, params or ())
            self.connection.commit()
            return True
        except Error as e:
            logger.error(f"Error executing query: {e}")
            if self.connection:
                self.connection.rollback()
            return False

    def fetch_data(self, query, params=None):
        try:
            if not self.connection or not self.connection.is_connected():
                self.connect()
            if not self.cursor:
                return None
            self.cursor.execute(query, params or ())
            return self.cursor.fetchall()
        except Error as e:
            logger.error(f"Error fetching data: {e}")
            return None
