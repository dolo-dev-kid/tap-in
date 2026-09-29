CREATE TABLE users (
id UUID PRIMARY KEY,
username TEXT,
email TEXT,
role TEXT,
bio TEXT,
bands_balance INTEGER DEFAULT 0
);
