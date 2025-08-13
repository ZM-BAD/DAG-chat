-- 创建对话元数据表 t_conversations
-- MySQL 8.4.6 兼容
-- 编码: UTF-8

CREATE TABLE IF NOT EXISTS t_conversations
(
    id
    CHAR
(
    36
) NOT NULL COMMENT '主键 (UUID)',
    user_id CHAR
(
    36
) NOT NULL COMMENT '所属用户',
    title VARCHAR
(
    64
) NOT NULL COMMENT '自动生成会话标题',
    model VARCHAR
(
    64
) NOT NULL COMMENT '使用的对话大模型',
    create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY
(
    id
),
    KEY idx_user_id
(
    user_id
),
    KEY idx_update_time
(
    update_time
)
    ) ENGINE = InnoDB
    DEFAULT CHARSET = utf8mb4
    COLLATE = utf8mb4_unicode_ci COMMENT ='大模型对话元数据表';
