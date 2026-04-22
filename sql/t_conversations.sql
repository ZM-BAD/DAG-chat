-- Create conversation metadata table t_conversations
-- MySQL 8.4.6 compatible
-- Encoding: UTF-8

CREATE TABLE IF NOT EXISTS t_conversations
(
    id          CHAR(36)    NOT NULL COMMENT 'Primary key (UUID)',
    user_id     VARCHAR(36) NOT NULL COMMENT 'Owner user ID',
    title       VARCHAR(64) NOT NULL COMMENT 'Auto-generated conversation title',
    model       VARCHAR(64) NOT NULL COMMENT 'LLM model used for conversation',
    create_time TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
    update_time TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time',
    PRIMARY KEY (id),
    KEY idx_user_id (user_id),
    KEY idx_update_time (update_time)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci COMMENT ='LLM conversation metadata table';
