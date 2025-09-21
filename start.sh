#!/bin/bash

# 启动脚本 - 用于启动UniformLLM项目的前端和后端

# 清理函数
cleanup() {
    echo "\n正在停止服务..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo "后端服务已停止"
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo "前端服务已停止"
    fi
    exit 0
}

# 设置信号处理
trap cleanup SIGINT SIGTERM

# 函数：显示帮助信息
display_help() {
    echo "Usage: $0 [option]"
    echo "Options:"
    echo "  --frontend     仅启动前端"
    echo "  --backend      仅启动后端"
    echo "  --all          同时启动前端和后端"
    echo "  --help         显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 --frontend  # 启动前端（默认端口3000）"
    echo "  $0 --backend   # 启动后端（默认端口8000）"
    echo "  $0 --all       # 同时启动前端和后端"
}

# 函数：启动前端
start_frontend() {
    echo "正在启动前端服务..."
    cd frontend
    echo "安装前端依赖..."
    npm install
    echo "启动前端开发服务器..."
    echo "前端将在 http://localhost:3000 上运行"
    npm start &
    FRONTEND_PID=$!
    cd ..
    
    # 等待前端服务启动
    echo "等待前端服务启动..."
    for i in {1..60}; do
        if curl -s -f http://localhost:3000 > /dev/null 2>&1; then
            echo "前端服务已启动！"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo "前端服务启动超时！"
    return 1
}

# 函数：启动后端
start_backend() {
    echo "正在启动后端服务..."
    cd backend
    echo "安装Python依赖..."
    pip install -r requirements.txt
    echo "启动后端服务器..."
    echo "后端将在 http://localhost:8000 上运行"
    python run_api.py &
    BACKEND_PID=$!
    cd ..
    
    # 等待后端服务启动
    echo "等待后端服务启动..."
    for i in {1..60}; do  # 增加到60秒等待时间
        if curl -s -f http://localhost:8000/health > /dev/null 2>&1; then
            echo ""
            echo "后端服务已启动！"
            # 额外等待5秒确保数据库连接也准备好
            echo "等待数据库连接稳定..."
            sleep 5
            
            # 测试数据库连接
            echo "测试数据库连接..."
            if curl -s -f "http://localhost:8000/api/v1/dialogue/list?user_id=zm-bad&page=1&page_size=1" > /dev/null 2>&1; then
                echo "数据库连接正常！"
                return 0
            else
                echo "数据库连接还未准备好，继续等待..."
            fi
        fi
        if [ $((i % 10)) -eq 0 ]; then
            echo ""  # 每10秒换行
        fi
        echo -n "."
        sleep 1
    done
    
    echo "后端服务启动超时！"
    return 1
}

# 检查参数
if [ $# -eq 0 ]; then
    display_help
    exit 1
fi

# 处理参数
case "$1" in
    --frontend)
        start_frontend
        ;;
    --backend)
        start_backend
        ;;
    --all)
        # 启动后端服务
        if ! start_backend; then
            echo "后端服务启动失败，正在清理..."
            if [ ! -z "$BACKEND_PID" ]; then
                kill $BACKEND_PID 2>/dev/null
            fi
            exit 1
        fi
        
        # 启动前端服务
        if ! start_frontend; then
            echo "前端服务启动失败，正在清理..."
            if [ ! -z "$FRONTEND_PID" ]; then
                kill $FRONTEND_PID 2>/dev/null
            fi
            if [ ! -z "$BACKEND_PID" ]; then
                kill $BACKEND_PID 2>/dev/null
            fi
            exit 1
        fi
        
        echo "\n前端和后端服务已启动！"
        echo "前端: http://localhost:3000"
        echo "后端: http://localhost:8000"
        echo "\n按 Ctrl+C 停止所有服务"
        wait  # 等待所有后台任务完成
        ;;
    --help)
        display_help
        ;;
    *)
        echo "错误: 未知选项 $1"
        display_help
        exit 1
        ;;
esac