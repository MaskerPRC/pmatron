# PMAtron

![GitHub stars](https://img.shields.io/github/stars/maskerprc/pmatron?style=social)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Downloads](https://img.shields.io/github/downloads/maskerprc/pmatron/total)
![Build Status](https://img.shields.io/github/workflow/status/maskerprc/pmatron/CI)

PMAtron 是一款基于 Electron 的创新桌面应用，能在本地为你呈现完整的 phpMyAdmin 功能体验。它巧妙运用了 PHP-WASM 技术，让你无需传统 PHP 服务器环境即可直接享有 phpMyAdmin 的全部功能。

![img_1.png](img_1.png)

## ✨ 功能特色

PMAtron 为你重新定义使用 phpMyAdmin 的方式，带来：

- **零配置体验**：无需搭建任何 Web 服务器或 PHP 环境，即刻启动、使用 phpMyAdmin。
- **原生桌面体验**：以桌面应用形式运行，提供更顺畅、更直观的操作。
- **增强安全性**：自定义协议的实现，为传统浏览器访问方式提供更多安全保护层。
- **跨平台支持**：可在 Windows、macOS 和 Linux 上无缝运行。
- **离线能力**：即使在无网络环境下，也能对本地数据库进行访问与管理。
- **现代架构**：基于 Electron 与 PHP-WASM，提供高性能与高可靠性的稳定体验。

## 加入我们（利用休息时间维护，开发不易，帮忙点个Star）
加入我们的技术交流微信群！

如果你对 PMAtron 项目有兴趣，想了解更多技术细节、交流使用经验或参与社区贡献，欢迎扫码加入我们的技术交流微信群。

<img alt="img.png" height="300" src="img.png" width="300"/>

入群你将获得：

- 最新开发进度与版本更新信息
- 社区开发者的经验分享与技术答疑
- 使用技巧、BUG 反馈、功能建议的讨论平台
- 第一时间参与社区活动与新特性测试

请在加群时备注你的 GitHub 用户名或关注的方向，以便我们更好地为你提供帮助。

## 🚀 快速开始

运行 PMAtron 非常简单：

```bash
# 克隆仓库
git clone https://github.com/maskerprc/pmatron.git

# 进入项目目录
cd pmatron

# 安装依赖
npm install

# 启动应用程序
npm start
```

## 🗺️ 开发里程碑

以下是 PMAtron 的开发里程碑：

- [ ] **通过 UI 选择当前登录的 MySQL 数据库账号密码**  
  允许用户通过图形界面方便地选择和管理 MySQL 数据库的登录凭证。

- [ ] **支持使用 HTTP 和 SOCKS5 代理访问 MySQL**  
  实现通过 HTTP 和 SOCKS5 代理服务器连接到 MySQL 数据库，增强网络连接的灵活性和安全性。

- [ ] **优化 UI 交互体验，通过 Hack CSS 的方式**  
  通过自定义 CSS 样式提升用户界面的美观性和交互的流畅性，提供更好的用户体验。

- [ ] **支持 PostgreSQL 和 SQLite 数据库**  
  扩展数据库支持范围，增加对 PostgreSQL 和 SQLite 的兼容，满足更多用户的需求。

- [ ] **支持自动更新客户端**  
  实现客户端的自动更新功能，确保用户始终使用最新版本，享受最新的功能和安全补丁。

- [ ] **支持连接导入导出**  
  提供连接配置的导入和导出功能，方便用户在不同设备或环境中快速配置数据库连接。

- [ ] **支持多用户**  
  增加多用户支持，允许多个用户在同一客户端中管理不同的数据库连接和配置。

- [ ] **多语言 i18n 支持**  
  实现国际化（i18n），支持多种语言界面，方便全球用户使用 PMAtron。


## 🤝 欢迎贡献

我们非常欢迎社区贡献！你可以通过以下方式参与到 PMAtron 的建设中：

### 开发流程
1. Fork 本仓库
2. 创建分支以添加新特性（`git checkout -b feature/AmazingFeature`）
3. 提交你的改动（`git commit -m 'Add some AmazingFeature'`）
4. 推送到远程分支（`git push origin feature/AmazingFeature`）
5. 发起 Pull Request

### 开发环境搭建

```bash
# 安装开发依赖
npm install --dev

# 运行测试
npm test

# 构建生产版本
npm run build
```

### 代码规范
- 遵循现有的代码风格
- 使用有意义的变量与函数命名
- 对复杂逻辑添加必要的注释
- 为新增特性编写测试

## 📈 项目成长轨迹

[![Star History Chart](https://api.star-history.com/svg?repos=MaskerPRC/pmatron&type=Date)](https://star-history.com/#MaskerPRC/pmatron&Date)

自项目诞生以来，得益于出色的社区成员与用户，我们的星标与关注度持续增长。

## 🙏 致谢

PMAtron 的成长离不开众多优秀项目与社区的贡献与支持：

- 感谢 phpMyAdmin 团队提供出色的数据库管理工具
- 感谢 Electron 团队，让跨平台桌面应用成为可能
- 感谢 PHP-WASM 项目，为我们带来在浏览器环境中运行 PHP 的新思路
- 感谢所有为 PMAtron 做出贡献的开发者与社区成员
- 感谢每一位为本项目加星标、Fork 或反馈问题的用户

## 📄 授权许可

PMAtron 在 MIT 许可下发布。详情请查看 [LICENSE](LICENSE) 文件。

---

<div align="center">
以 ❤️ 倾注的 PMAtron 团队
</div>
