# 1) 进入项目目录
cd "c:\Users\32757\Desktop\电子衣橱"

# 2) 初始化 git
git init

# 3) 设置主分支名为 main
git branch -M main

# 4) 添加所有文件
git add .

# 5) 首次提交
git commit -m "init: first commit"

# 6) 绑定远程仓库
git remote add origin https://github.com/cangerzai/wardrobe

# 7) 推送到 GitHub
git push -u origin main