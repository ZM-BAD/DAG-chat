#!/usr/bin/env python3.13

import logging

import mysql.connector
from mysql.connector import Error
from config import MYSQL_CONFIG

# 获取日志记录器
logger = logging.getLogger(__name__)


class MySQLConnection:
    def __init__(self):
        self.host = MYSQL_CONFIG['host']
        self.user = MYSQL_CONFIG['user']
        self.password = MYSQL_CONFIG['password']
        self.database = MYSQL_CONFIG['database']
        self.port = MYSQL_CONFIG['port']
        self.connection = None
        self.cursor = None

    def connect(self):
        try:
            self.connection = mysql.connector.connect(
                host=self.host,
                user=self.user,
                password=self.password,
                database=self.database,
                port=self.port
            )
            if self.connection.is_connected():
                logger.info('Connected to MySQL database')
                self.cursor = self.connection.cursor()
                return True
        except Error as e:
            logger.error(f'Error connecting to MySQL database: {e}')
            return False

    def disconnect(self):
        if self.connection and self.connection.is_connected():
            self.cursor.close()
            self.connection.close()
            logger.info('MySQL connection closed')

    def execute_query(self, query, params=None):
        try:
            if not self.connection or not self.connection.is_connected():
                self.connect()
            self.cursor.execute(query, params or ())
            self.connection.commit()
            return True
        except Error as e:
            logger.error(f'Error executing query: {e}')
            self.connection.rollback()
            return False

    def fetch_data(self, query, params=None):
        try:
            if not self.connection or not self.connection.is_connected():
                self.connect()
            self.cursor.execute(query, params or ())
            return self.cursor.fetchall()
        except Error as e:
            logger.error(f'Error fetching data: {e}')
            return None
