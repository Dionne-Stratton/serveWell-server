UPDATE admin_users
SET
  password_hash = 'sha256$servewell-demo-admin-v1$bo8rcdtOoNL8/6EOwjl+JMkjYyZ4g5FdqlNFbuE6YZo=',
  updated_at = CURRENT_TIMESTAMP
WHERE email = 'church@example.com';
