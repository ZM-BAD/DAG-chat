#!/bin/bash

# 启动脚本 - 用于启动UniformLLM项目的前端和后端

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
    cd ..
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
    cd ..
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
        start_frontend
        start_backend
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