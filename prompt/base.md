这是一个大模型网页问答应用，包含前端和后端。对话主要围绕/chat接口来进行。
已知：对话信息分为user.message和assistant.message。在不考虑异常中止的情况下：一个user问和一个assistant回答构成一个**问答对，在逻辑上是最小对话单元，不可分割**。

在数据库和前端的数据定义中，一个消息包含id（mongodb生成的_id的hexstring形式），parent_ids以及children。user.message的parent_ids和children都是assistant.message的id；assistant.message的parent_ids和children也都是user.message的id（首个用户问，没有被追问的大模型回答除外）

其中parent_ids和children构建了消息之间的关联关系。考虑到问答对的逻辑关系，一个user.message的children只有一个元素，一个assistant.message的parent_ids也只有一个元素。

user的parent_ids可能没有（首个用户提问），也可能有多个，即：合并提问：
assistant的children可能没有（没有继续追问的大模型回答），也可能有多个，即：分支提问。

整个对话的关系构成了一个DAG，即有向无环图，整个DAG只会有一个根节点，即用户首次提问的问答对。当用户从未进行分支提问的时候，DAG退化为链表；当用户进行过分支提问，从未进行过合并提问的时候，DAG退化为Tree。

整个项目的启动方式在start.sh里面，可以执行./start.sh --all来整体启动。可以使用chrome-devtools的mcp服务来观察代码的运行情况。要整体启动，不能仅启动前端，因为这样无法从后端获得数据。
