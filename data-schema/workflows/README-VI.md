# Bộ 8 workflow Facebook và Instagram

Import từng file JSON trong thư mục này. Mỗi file là một workflow riêng. Các workflow trao đổi qua 9 Data Tables. Không cần chọn ID sub-workflow.

| File | Công việc | Trạng thái vào → ra |
|---|---|---|
| 01-content-planner.json | Agent lập 30 kế hoạch, tạo bài cho tài khoản đang hoạt động | Tạo `NEW` |
| 02-facebook-writer.json | Agent viết Facebook, lưu phiên bản mới | `NEW` / `NEEDS_REWRITE` → `DRAFT` |
| 03-instagram-writer.json | Agent viết Instagram, kiểm tra giới hạn caption | `NEW` / `NEEDS_REWRITE` → `DRAFT` |
| 04-kromoss-media.json | Tạo PNG, upload Cloudinary, lưu ảnh và liên kết | `DRAFT` → `READY_REVIEW` |
| 05-ai-review.json | Kiểm tra ảnh bằng model nhìn ảnh, Agent review chữ và ảnh | `READY_REVIEW` → `AI_APPROVED` / `NEEDS_REWRITE` / `REVIEW_FAILED` |
| 06-human-approval.json | Email có ảnh, caption, form duyệt và lựa chọn nhạc | `AI_APPROVED` → `WAITING_APPROVAL` → `APPROVED` / `MANUAL_READY` / `REJECTED` / `APPROVAL_EXPIRED` |
| 07-publish-facebook.json | Đăng ảnh Facebook khi đến lịch, lưu kết quả API | `APPROVED` → `PUBLISHED` / `PUBLISH_FAILED` / `PUBLISH_UNKNOWN` |
| 08-publish-instagram.json | Đăng ảnh Instagram hoặc gửi gói đăng thủ công | `APPROVED` → kết quả đăng; `MANUAL_READY` → `AWAITING_MANUAL_POST` |

## Cấu hình trước khi chạy

Mở node `Configuration` trong từng workflow. Sửa các giá trị cần dùng:

- `brandId`, `brandName`, `brandBrief`: thương hiệu và quy tắc viết. Bảng brand knowledge cũ đã bị xóa nên thông tin thương hiệu hiện nằm tại đây.
- `model`: chọn model OpenRouter có tool calling cho các Agent. Workflow 05 cũng dùng model này để đọc ảnh, nên cần model hỗ trợ image input.
- `fromEmail`, `toEmail`: email gửi và người duyệt. Chọn SMTP credential cho node email ở workflow 06 và 08.
- `cloudName`, `uploadPreset`: Cloudinary cloud name và unsigned upload preset. Chỉ workflow 04 cần hai giá trị này. Bật unsigned upload trong Cloudinary, giới hạn định dạng ảnh và chọn thư mục upload phù hợp.
- `kromossUrl`: mặc định `http://127.0.0.1:8787`. Địa chỉ này dùng cho n8n chạy Node trên cùng máy Mac. Nếu chuyển n8n sang Docker trên Mac, dùng `http://host.docker.internal:8787` và cấu hình API lắng nghe địa chỉ Docker truy cập được.
- `graphVersion`: phiên bản Graph API mà ứng dụng Meta của bạn dùng. File mặc định `v23.0`; kiểm tra lại trong ứng dụng Meta trước khi chạy.
- `maxVersions`: mặc định 3. Agent review từ chối sẽ cho viết lại tối đa đến phiên bản 3.

Chọn OpenRouter credential trong bốn node model: Content Planner, Facebook Writer, Instagram Writer, Reviewer. Đây là bốn AI Agent nằm trong workflow, không phải bốn Agent độc lập trong Agent Builder.

Ở workflow 05, node `Vision image audit` dùng Header Auth: tên header `Authorization`, giá trị `Bearer <OpenRouter API key>`. Lưu key trong credential của n8n.

Ở workflow 07 và 08, chọn Header Auth cho mọi node HTTP Meta: tên header `Authorization`, giá trị `Bearer <Meta token>`. Facebook dùng Page access token có quyền đăng lên Page. Instagram dùng token có quyền đăng cho tài khoản professional đã liên kết. Nếu hai kênh cần token khác nhau, chọn hai credential riêng. Không nhập token trong node Configuration hoặc Data Tables.

## Bảng dữ liệu

Các node dùng tên bảng đang thấy trên giao diện n8n, có dấu cách:

`social accounts`, `content plans`, `posts`, `post versions`, `media assets`, `post version media`, `reviews`, `approval requests`, `publications`.

Nếu tên trên máy bạn dùng dấu gạch dưới, chọn lại bảng trong từng node Data Table. Các cột nghiệp vụ vẫn dùng camelCase theo CSV trước đó. Các file không ghi vào cột hệ thống `id`, `createdAt`, `updatedAt`.

Kiểm tra `social accounts` có đúng `brandId`, `accountId`, `platform`, `externalAccountId`, `status=ACTIVE`. `externalAccountId` là Page ID hoặc Instagram professional account ID. Mỗi kế hoạch tạo một bài cho mỗi tài khoản ACTIVE của thương hiệu.

Các cột số: `versionNumber`, `sortOrder`, `width`, `height`, `sizeBytes`, `seed`, `attemptCount`. Các cột còn lại dùng String, kể cả thời gian ISO. Không cần thêm cột mới để chạy bộ này.

## Ảnh được lưu ở đâu

Kromoss giữ file PNG gốc trong thư mục `outputs` của API. Workflow đọc đường dẫn cụ thể từ header `X-Output-Path`, tải binary lên Cloudinary rồi lưu metadata vào `media assets`. Cột `publicUrl` dùng đường dẫn Cloudinary có biến đổi `f_jpg,q_90` để trả ảnh JPEG cho Instagram. `post version media` liên kết đúng ảnh với đúng phiên bản caption.

Cloudinary là dịch vụ được bộ workflow này chọn để cung cấp URL công khai. Bạn cần tạo tài khoản và upload preset trước. File không tự đăng ký hoặc cấu hình dịch vụ thay bạn. Xem [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference).

## Duyệt và chọn nhạc

Workflow 06 gửi email bằng `Send and Wait`, nên n8n tự tạo link form ký riêng cho execution. Không cần tự dán link execution trước. Người nhận email là người được cấp quyền quyết định qua link đó.

- `APPROVE_AUTO`: duyệt đúng phiên bản hiện tại; workflow đăng sẽ lấy bài khi đến lịch.
- `APPROVE_MUSIC`: chỉ có trong form Instagram. Khi đến lịch, workflow 08 gửi email có link tải JPEG và caption. Bạn mở Instagram, tạo bài, chọn nhạc rồi bấm đăng.
- `REJECT`: dừng bài đó. Nếu muốn viết lại sau khi người dùng từ chối, đổi trạng thái bài sang `NEEDS_REWRITE`.

Instagram không được mở sẵn một trang soạn bài đã nạp ảnh qua link email. Bộ workflow này gửi ảnh và caption để đăng thủ công. Trạng thái `AWAITING_MANUAL_POST` không có nghĩa bài đã đăng. Sau khi bạn đăng thủ công, ghi ID/link bài thật và cập nhật `posts` cùng `publications` thành `PUBLISHED`.

`approvalUrl` trong bảng được để trống vì link ký do node Send and Wait tạo lúc chạy. Không giả lập URL form. Quyết định hết hạn sau 24 giờ sẽ không được dùng để đăng. Trước khi áp dụng quyết định, workflow kiểm tra lại `currentVersionId`.

## Thử theo thứ tự

1. Cấu hình credential và kiểm tra API Kromoss bằng `GET /health`.
2. Chạy 01 bằng tay. Kiểm tra kế hoạch và bài NEW được tạo.
3. Chạy 02 hoặc 03. Kiểm tra phiên bản caption và trạng thái DRAFT.
4. Chạy 04. Kiểm tra publicUrl mở được trong trình duyệt và ảnh được liên kết đúng versionId.
5. Chạy 05. Nếu cần viết lại, chạy lại writer rồi 04 và 05. Nếu đạt, bài chuyển AI_APPROVED.
6. Chạy 06. Mở email và gửi quyết định qua form.
7. Đặt scheduledAt của bài thử đến giờ hiện tại. Chạy 07 hoặc 08 khi bạn sẵn sàng đăng bài thật. Bước này gọi API đăng công khai.
8. Kiểm tra ID API thật trong publications và trạng thái PUBLISHED. Chạy lại publisher để kiểm tra bài đã đăng không được đăng lần nữa.

Schedule đều được để disabled trong file import. Sau khi thử thành công, bật lịch 02–08. Với 01, sửa lịch thành đầu tháng hoặc chạy bằng tay theo nhu cầu. Lịch mẫu 01 là 24 giờ và đang tắt; không bật nguyên lịch này nếu bạn chỉ muốn lập kế hoạch mỗi tháng.

Mỗi lần chạy các bước xử lý chỉ chọn một bài. Khoảng cách lịch mặc định 5 phút, riêng publisher 2 phút. Tăng khoảng cách nếu máy tạo ảnh chậm. Chạy từng workflow tuần tự khi thử.

## Trường hợp cần xử lý lại

- Không chạy đồng thời hai execution của cùng workflow/tài khoản. Kiểm tra lịch sử và cập nhật trạng thái có điều kiện giúp tránh đăng lặp khi chạy tuần tự; Data Tables không tạo ràng buộc unique hoặc giao dịch xuyên nhiều node cho bộ này.
- Nếu Meta trả ID, workflow mới ghi `PUBLISHED`. Nếu request bị đứt hoặc không có kết quả chắc chắn, workflow ghi `UNKNOWN` và bài là `PUBLISH_UNKNOWN`. Kiểm tra bài trên kênh trước khi thử lại.
- Nếu execution chết sau khi ghi `PUBLISHING`, bài sẽ dừng ở đó để bạn kiểm tra kết quả Meta. Không đổi sang APPROVED để thử lại trước khi đối chiếu kênh.
- Nếu API trả lỗi rõ ràng, bài là `PUBLISH_FAILED`. Sau khi sửa token/quyền, có thể đặt bài lại APPROVED. Bản ghi publicationId được cập nhật kết quả mới nhất; attemptCount tăng sau mỗi lần xử lý. Execution history lưu các lần chạy trước.
- Nếu SMTP lỗi sau bước claim, khắc phục credential rồi kiểm tra execution. Chỉ đặt lại AI_APPROVED khi không còn email/form cũ đang chờ. Nếu gửi gói nhạc thất bại, kiểm tra email trước khi reset trạng thái.
- Planner bỏ qua planId đã có. Nếu execution 01 bị dừng giữa bước ghi plans và posts, kiểm tra các dòng thiếu rồi bổ sung posts trước khi chạy tiếp. Hai bước ghi không phải giao dịch nguyên khối.
- Các lỗi AI, thiếu dữ liệu hoặc upload ảnh sẽ làm execution fail rõ ràng. Không có bước tự gán APPROVED hoặc PUBLISHED khi thiếu kết quả.

## Đã kiểm tra và giới hạn kiểm thử

Script `../verify-production-workflows.mjs` kiểm tra đủ 8 file, tên node, kết nối, cú pháp Code node, cú pháp expression và các tình huống nghiệp vụ. Việc import đã được thử bằng CLI n8n vào cơ sở dữ liệu tạm riêng.

Kết quả: 8 workflow, 163 node, 204 expression đã kiểm tra cú pháp, 16 bài kiểm tra nghiệp vụ đều đạt. Prettier và kiểm tra cú pháp JavaScript đã đạt. Lệnh ESLint ở thư mục gốc không chạy được vì không có file eslint.config tại đó. Không chạy bộ kiểm thử toàn repository.

Chưa có kiểm thử toàn chuỗi bằng tài khoản thật trong bộ file này. Model, SMTP, Cloudinary và Meta cần credential hợp lệ. Kromoss chưa kết nối được tại lần kiểm tra trước. Không thể kết luận đã đăng Facebook/Instagram thành công chỉ từ việc import JSON.
