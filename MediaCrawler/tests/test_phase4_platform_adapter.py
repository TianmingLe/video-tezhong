from services.platform_adapter import (
    build_xhs_explore_url,
    parse_video_id,
    search_rank_key,
)


def test_parse_video_id_douyin():
    assert parse_video_id(platform="dy", url_or_id="https://www.douyin.com/video/123456789") == "123456789"


def test_parse_video_id_xhs_note_id_and_url():
    assert parse_video_id(platform="xhs", url_or_id="66abcd000000000000000000") == "66abcd000000000000000000"
    assert (
        parse_video_id(
            platform="xhs",
            url_or_id="https://www.xiaohongshu.com/explore/66abcd000000000000000000?xsec_token=xx",
        )
        == "66abcd000000000000000000"
    )


def test_build_xhs_explore_url():
    assert build_xhs_explore_url("66abcd000000000000000000").startswith("https://www.xiaohongshu.com/explore/66abcd000000000000000000")


def test_rank_key_xhs_interactions():
    item = {"liked_count": 10, "collected_count": 3, "comment_count": 2}
    assert search_rank_key(platform="xhs", content=item) == 15


def test_rank_key_bili_pubdate():
    item = {"create_time": 1710000000}
    assert search_rank_key(platform="bili", content=item) == 1710000000

