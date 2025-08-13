#!/usr/bin/env python3.13

import logging

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

# 获取日志记录器
logger = logging.getLogger(__name__)


class MongoDBConnection:
    def __init__(self, host='localhost', port=27017, username=None, password=None, database='test_db'):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.database = database
        self.client = None
        self.db = None

    def connect(self):
        try:
            # Create MongoDB client
            if self.username and self.password:
                # Connect with authentication
                uri = f'mongodb://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}?authSource=admin'
                self.client = MongoClient(uri)
            else:
                # Connect without authentication
                self.client = MongoClient(self.host, self.port)

            # Check if connection is successful
            self.client.admin.command('ping')
            logger.info('Connected to MongoDB database')

            # Get database
            self.db = self.client[self.database]
            return True
        except ConnectionFailure as e:
            logger.error(f'Error connecting to MongoDB database: {e}')
            return False

    def disconnect(self):
        if self.client:
            self.client.close()
            logger.info('MongoDB connection closed')

    def get_collection(self, collection_name):
        if not self.db:
            if not self.connect():
                return None
        return self.db[collection_name]

    def insert_one(self, collection_name, document):
        collection = self.get_collection(collection_name)
        if not collection:
            return None
        try:
            result = collection.insert_one(document)
            return result.inserted_id
        except Exception as e:
            logger.error(f'Error inserting document: {e}')
            return None

    def find(self, collection_name, query=None, projection=None):
        collection = self.get_collection(collection_name)
        if not collection:
            return None
        try:
            cursor = collection.find(query or {}, projection)
            return list(cursor)
        except Exception as e:
            logger.error(f'Error finding documents: {e}')
            return None


# Example usage
if __name__ == '__main__':
    db = MongoDBConnection()
    if db.connect():
        # Insert a document example
        user = {'name': 'John Doe', 'email': 'john@example.com', 'age': 30}
        user_id = db.insert_one('users', user)
        print(f'Inserted user with ID: {user_id}')

        # Find documents example
        users = db.find('users')
        print(f'Found users: {users}')

        db.disconnect()
