from pydantic import BaseModel, Field
import os


class Settings(BaseModel):
    absstats_base_url: str = Field(default="http://localhost:3010")
    poll_seconds: int = Field(default=300)
    state_db_path: str = Field(default="/data/state.db")

    achievements_path: str = Field(default="/data/json/achievements.points.json")
    series_refresh_seconds: int = Field(default=24 * 3600)

    # SMTP
    smtp_host: str = Field(default="")
    smtp_port: int = Field(default=587)
    smtp_username: str = Field(default="")
    smtp_password: str = Field(default="")
    smtp_from: str = Field(default="")
    smtp_to_override: str = Field(default="")

    discord_proxy_url: str = Field(default="")

    completed_endpoint: str = Field(default="/api/completed")
    allow_playlist_fallback: bool = Field(default=True)
    send_test_email: bool = Field(default=False)
    xp_start_timestamp: int = Field(default=1767225600)
    achievements_scope: str = Field(default="all_time")
    progression_scope: str = Field(default="since_xp_start")
    verify_listen_threshold: float = Field(default=0.80)
    completion_threshold: float = Field(default=0.95)
    strict_verification: bool = Field(default=False)
    require_duration_for_credit: bool = Field(default=True)
    require_2026_session_for_credit: bool = Field(default=True)
    user_xp_start_overrides_path: str = Field(default="/data/json/user_xp_start.json")
    wrapped_boss_hp: int = Field(default=250000)
    wrapped_year: int = Field(default=0)
    wrapped_enabled: bool = Field(default=True)
    run_achievement_backfill: bool = Field(default=False)
    backfill_once_key: str = Field(default="ach_backfill_v1")
    allowed_users: str = Field(default="")
    radar_check_interval_hours: int = Field(default=12)
    admin_email: str = Field(default="")


def _find_achievements_path(configured_path: str) -> str:
    """Helper to find achievements.points.json in common volume locations if configured path fails."""
    if os.path.exists(configured_path):
        return configured_path

    candidates = [
        "/data/json/achievements.points.json",
        "/data/achievements.points.json",
        "./json/achievements.points.json",
        configured_path,
    ]

    for p in candidates:
        if os.path.exists(p):
            return p

    return configured_path


def load_settings() -> Settings:
    def b(name: str, default: bool) -> bool:
        v = os.getenv(name)
        if v is None:
            return default
        return v.strip().lower() in ("1", "true", "yes", "y", "on")

    def i(name: str, default: int) -> int:
        v = os.getenv(name)
        if v is None:
            return default
        try:
            return int(v.strip())
        except Exception:
            return default

    raw_ach_path = "/data/json/achievements.points.json"
    final_ach_path = _find_achievements_path(raw_ach_path)

    return Settings(
        absstats_base_url=os.getenv("ABSSTATS_BASE_URL", "http://localhost:3010").rstrip("/"),
        poll_seconds=i("POLL_SECONDS", 300),
        state_db_path=os.getenv("STATE_DB_PATH", "/data/state.db"),
        achievements_path=final_ach_path,
        series_refresh_seconds=i("SERIES_REFRESH_SECONDS", 24 * 3600),
        smtp_host=os.getenv("SMTP_HOST", ""),
        smtp_port=i("SMTP_PORT", 587),
        smtp_username=os.getenv("SMTP_USERNAME", ""),
        smtp_password=os.getenv("SMTP_PASSWORD", ""),
        smtp_from=os.getenv("SMTP_FROM", ""),
        smtp_to_override=os.getenv("SMTP_TO_OVERRIDE", ""),
        discord_proxy_url=os.getenv("DISCORD_PROXY_URL", ""),
        completed_endpoint=os.getenv("COMPLETED_ENDPOINT", "/api/completed"),
        allow_playlist_fallback=b("ALLOW_PLAYLIST_FALLBACK", True),
        send_test_email=b("SEND_TEST_EMAIL", False),
        xp_start_timestamp=i("XP_START_TIMESTAMP", 1767225600),
        achievements_scope=os.getenv("ACHIEVEMENTS_SCOPE", "all_time").strip().lower(),
        progression_scope=os.getenv("PROGRESSION_SCOPE", "since_xp_start").strip().lower(),
        verify_listen_threshold=float(os.getenv("VERIFY_LISTEN_THRESHOLD", "0.80")),
        completion_threshold=float(os.getenv("COMPLETION_THRESHOLD", "0.95")),
        strict_verification=b("STRICT_VERIFICATION", False),
        require_duration_for_credit=b("REQUIRE_DURATION_FOR_CREDIT", True),
        require_2026_session_for_credit=b("REQUIRE_2026_SESSION_FOR_CREDIT", True),
        user_xp_start_overrides_path="/data/json/user_xp_start.json",
        wrapped_boss_hp=i("WRAPPED_BOSS_HP", 250000),
        wrapped_year=i("WRAPPED_YEAR", 0),
        wrapped_enabled=b("WRAPPED_ENABLED", True),
        run_achievement_backfill=b("RUN_ACHIEVEMENT_BACKFILL", False),
        backfill_once_key=os.getenv("BACKFILL_ONCE_KEY", "ach_backfill_v1").strip() or "ach_backfill_v1",
        allowed_users=os.getenv("ALLOWED_USERS", "").strip(),
        radar_check_interval_hours=i("RADAR_CHECK_INTERVAL_HOURS", 12),
        admin_email=os.getenv("ADMIN_EMAIL", "").strip(),
    )




