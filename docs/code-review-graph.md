# Code review graph

Graph giúp thu hẹp phạm vi đọc code, tìm callers/imports và đánh giá tác động.
Repo nhỏ, nên khi graph không thêm thông tin thì đọc thẳng file. Graph không
mô hình hóa lookup TurboModule bằng chuỗi, Codegen, autolinking, Gradle, podspec hay Objective-C++.

## Cài đặt trên máy mới

Cài CLI bằng `pipx install code-review-graph`, bảo đảm lệnh có trong PATH của
terminal và ứng dụng AI. Từ thư mục gốc repo:

```sh
code-review-graph install --platform claude-code   # hoặc cursor / codex
code-review-graph build --repo .
```

`install` có thể tạo lại path tuyệt đối hoặc hook; kiểm tra cấu hình sau khi chạy.

`.mcp.json` và `.cursor/mcp.json` là cấu hình local, được Git ignore. Cấu hình
portable dùng lệnh trong PATH và cwd tương đối:

```json
{
  "mcpServers": {
    "code-review-graph": {
      "command": "code-review-graph",
      "args": ["serve"],
      "cwd": ".",
      "type": "stdio"
    }
  }
}
```

## Cập nhật và review

```sh
code-review-graph status                 # branch, commit, lần cập nhật gần nhất
code-review-graph update --skip-flows    # cập nhật nhanh khi đang sửa
code-review-graph update --brief         # trước review: cập nhật flows + tóm tắt tác động
code-review-graph build --repo .         # rebuild khi đổi path repo hoặc index stale
```

Hook Claude `PostToolUse` chỉ bắt `Edit|Write`; chỉnh bằng shell/Cursor/Codex
không được hook này cập nhật. SessionStart chỉ báo status.

## Ignore và phạm vi index

- `.gitignore` gốc loại `.code-review-graph/`, `.mcp.json`, `.cursor/mcp.json` và
  `.claude/settings.local.json` khỏi commit; không commit database.
- Full build ưu tiên `git ls-files`; file mới chưa `git add` có thể chưa được index.
  Đọc source trực tiếp khi review file mới, không tự stage chỉ để đưa vào graph.
- `.gitignore` không untrack file đã tracked.
