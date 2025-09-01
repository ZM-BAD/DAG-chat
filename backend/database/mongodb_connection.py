#!/usr/bin/env python3.13

import logging

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

from backend import logging_config
from backend.config import MONGODB_CONFIG
import uuid

# 获取日志记录器
logger = logging.getLogger(__name__)
logging_config.setup_logging()


class MongoDBConnection:
    def __init__(self):
        self.uri = MONGODB_CONFIG['uri']
        self.database = MONGODB_CONFIG['database']
        self.username = MONGODB_CONFIG.get('username')
        self.password = MONGODB_CONFIG.get('password')
        self.host = MONGODB_CONFIG.get('host')
        self.port = MONGODB_CONFIG.get('port')
        self.client = None
        self.db = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()

    def connect(self):
        try:
            if self.uri:
                self.client = MongoClient(self.uri)
            elif self.username and self.password:
                self.client = MongoClient(
                    host=self.host,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                    authSource='admin'
                )
            else:
                self.client = MongoClient(self.host, self.port)

            # Check if connection is successful
            self.client.admin.command('ping')
            logger.info('Connected to MongoDB database')

            # Get database
            self.db = self.client[self.database]
            return True
        except ConnectionFailure as conn_err:
            logger.error(f'Error connecting to MongoDB database: {conn_err}')
            return False

    def disconnect(self):
        if self.client:
            self.client.close()
            logger.info('MongoDB connection closed')

    def insert(self, collection_name: str, document: dict):
        if self.client:
            collection = self.db[collection_name]
            return collection.insert_one(document).inserted_id
        return None

    def find(self, collection_name: str, query: dict, projection: dict = None, sort: list = None):
        if self.client:
            collection = self.db[collection_name]
            cursor = collection.find(query, projection)
            if sort:
                cursor = cursor.sort(sort)
            return list(cursor)
        return []

    def find_one(self, collection_name: str, query: dict, projection: dict = None, sort: list = None):
        if self.client:
            collection = self.db[collection_name]
            cursor = collection.find(query, projection)
            if sort:
                cursor = cursor.sort(sort)
            for doc in cursor:
                return doc
        return None

    def insert_one(self, collection_name: str, document: dict):
        if self.client:
            collection = self.db[collection_name]
            return collection.insert_one(document).inserted_id
        return None

    def insert_many(self, collection_name: str, documents: list):
        if self.client:
            collection = self.db[collection_name]
            return collection.insert_many(documents).inserted_ids
        return None

    def update(self, collection_name: str, query: dict, update_values: dict):
        if self.client:
            collection = self.db[collection_name]
            return collection.update_one(query, {"$set": update_values})
        return None


# Example usage
if __name__ == '__main__':
    # 使用上下文管理器确保连接关闭
    with MongoDBConnection() as db:
        if db.connect():
            # 生成唯一测试数据
            test_id = str(uuid.uuid4())
            test_user = {
                '_id': test_id,
                'name': 'Test User',
                'email': f'test_{test_id}@example.com',
                'age': 30
            }

            try:
                # 插入测试文档
                user_id = db.insert_one('users', test_user)
                logger.info(f'Inserted test user with ID: {user_id}')

                # 查询验证
                users = db.find('users', {'_id': test_id})
                logger.info(f'Found {len(users)} test users')

                # 清理测试数据
                db.db['users'].delete_one({'_id': test_id})
                logger.info('Cleaned up test data')

            except Exception as e:
                logger.error(f'Test failed: {str(e)}', exc_info=True)
        else:
            logger.error('Failed to connect to database during testing')
