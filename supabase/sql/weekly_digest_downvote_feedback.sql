-- Superseded: this session's earlier "download feedback" table is unused —
-- what was actually wanted was feedback collected on a thumbs-down rating.
drop table if exists weekly_digest_download_feedback;

-- Optional written reason captured when someone rates a weekly reflection down.
alter table weekly_digests add column if not exists feedback_comment text;
