from services.comment_processor import CommentProcessor


def test_comment_processor_tree_and_topk():
    raw = [
        {
            "aweme_id": "a",
            "comment_id": "c1",
            "content": "root1",
            "like_count": 10,
            "parent_comment_id": "0",
            "nickname": "u1",
        },
        {
            "aweme_id": "a",
            "comment_id": "c2",
            "content": "root2",
            "like_count": 20,
            "parent_comment_id": "0",
            "nickname": "u2",
        },
        {
            "aweme_id": "a",
            "comment_id": "s1",
            "content": "reply1",
            "like_count": 5,
            "parent_comment_id": "c2",
            "nickname": "u3",
        },
        {
            "aweme_id": "a",
            "comment_id": "s2",
            "content": "reply2",
            "like_count": 9,
            "parent_comment_id": "c2",
            "nickname": "u4",
        },
    ]

    out = CommentProcessor().build(raw_comments=raw, top_comments=1, top_replies=1, budget_chars=10_000)
    assert out["stats"]["total_comments"] == 4
    assert out["root_comments"][0]["content"] == "root2"
    assert len(out["root_comments"][0]["replies"]) == 1
    assert out["root_comments"][0]["replies"][0]["content"] == "reply2"


def test_comment_processor_truncates_when_budget_small():
    raw = [
        {
            "aweme_id": "a",
            "comment_id": "c1",
            "content": "x" * 5000,
            "like_count": 10,
            "parent_comment_id": "0",
            "nickname": "u1",
        }
    ]
    out = CommentProcessor().build(raw_comments=raw, top_comments=1, top_replies=0, budget_chars=100)
    assert out["stats"]["truncated"] is True

