import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays, Camera, Heart, Home, ImagePlus, Inbox, Leaf, MapPin,
  MessageCircleHeart, Palette, Plus, RotateCcw, Send, Settings, Sparkles,
  Trash2, X, ChevronLeft, ChevronRight, Clock3, FolderHeart
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const fallbackSettings = {
  site_title: "拾光小屋",
  subtitle: "把幸福的时刻，一格一格收藏起来",
  accent: "#8E9A8B",
  accent_2: "#C9B8A6",
  paper: "#F4EFE7",
  ink: "#4D4A45",
  background_url: ""
};

const TYPES = [
  ["date", "约会日", "♡"],
  ["travel", "旅行", "✦"],
  ["milestone", "纪念日", "★"],
  ["daily", "日常", "☁"],
  ["gift", "礼物", "✿"],
  ["other", "其他", "·"]
];

function today() {
  // 使用浏览器本地年月日，不使用 toISOString()，避免 UTC 时区把日期变成前一天。
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function fmtDate(v) {
  if (!v) return "";
  return new Date(`${v}T00:00:00`).toLocaleDateString("zh-CN", {
    year: "numeric", month: "long", day: "numeric"
  });
}

function useLocalDraft() {
  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("love-drafts") || "{}"); } catch { return {}; }
  });
  const save = (key, value) => {
    const next = { ...drafts, [key]: value };
    setDrafts(next);
    localStorage.setItem("love-drafts", JSON.stringify(next));
  };
  return [drafts, save];
}

function Modal({ title, children, onClose, wide=false }) {
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className={`modal ${wide ? "modal-wide" : ""}`}>
      <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>
      {children}
    </div>
  </div>;
}

function PixelButton({ children, onClick, secondary=false, danger=false, type="button", disabled=false }) {
  return <button type={type} disabled={disabled} className={`pixel-btn ${secondary ? "secondary" : ""} ${danger ? "danger" : ""}`} onClick={onClick}>{children}</button>;
}

function Empty({ icon, title, text }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><strong>{title}</strong><span>{text}</span></div>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [settings, setSettings] = useState(fallbackSettings);
  const [entries, setEntries] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [trash, setTrash] = useState([]);
  const [tab, setTab] = useState("home");
  const [modal, setModal] = useState(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [drafts, saveDraft] = useLocalDraft();
  const [albumFilterDate, setAlbumFilterDate] = useState(null); // 新增：相册日期筛选

  const refresh = async () => {
    if (!supabase) {
      console.error("Supabase 未配置，请检查 .env.local");
      setLoading(false);
      return;
    }

    const [
      { data: e, error: entryError },
      { data: p, error: photoError }
    ] = await Promise.all([
      supabase
        .from("entries")
        .select("*")
        .is("deleted_at", null)
        .order("event_date", { ascending: false }),

      supabase
        .from("photos")
        .select("*")
        .is("deleted_at", null)
        .order("photo_date", { ascending: false })
    ]);

    if (entryError) {
      console.error("读取 entries 失败：", entryError);
    }

    if (photoError) {
      console.error("读取 photos 失败：", photoError);
    }

    setEntries(e || []);
    setPhotos(p || []);

    if (session) {
      const { data: t, error: trashError } = await supabase
        .from("trash")
        .select("*")
        .order("deleted_at", { ascending: false });

      if (trashError) {
        console.error("读取 trash 失败：", trashError);
      }

      setTrash(t || []);
    }
  };

  useEffect(() => {
    (async () => {
      if (!supabase) { setLoading(false); return; }
      let { data } = await supabase.auth.getSession();
      if (!data.session) {
        const r = await supabase.auth.signInAnonymously();
        data = r.data;
      }
      setSession(data.session);
      const { data: s } = await supabase.from("site_settings").select("*").eq("id", true).maybeSingle();
      if (s) setSettings(s);
      await refresh();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("love-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session]);

  const cssVars = {
    "--accent": settings.accent,
    "--accent2": settings.accent_2,
    "--paper": settings.paper,
    "--ink": settings.ink,
    ...(settings.background_url ? { "--bg-image": `url(${settings.background_url})` } : {})
  };

  // 删除：先保存回收站记录，再尝试软删除。
  // 如果数据库的 entries/photos UPDATE RLS 不允许修改 deleted_at，
  // 自动尝试直接 DELETE，避免出现“点回收但原内容仍在”的情况。
  const softDelete = async (table, row) => {
    if (!supabase || !session?.user?.id || !row?.id) return;

    const trashPayload = {
      owner_id: session.user.id,
      source_table: table,
      source_id: row.id,
      payload: row
    };

    // 先写入回收站，确保删除后仍然能恢复。
    const { data: trashRow, error: trashError } = await supabase
      .from("trash")
      .insert(trashPayload)
      .select("id")
      .single();

    if (trashError) {
      console.error("写入回收站失败：", trashError);
      alert("删除失败：无法写入回收站。\n" + trashError.message);
      return;
    }

    // 优先使用软删除。
    const { error: updateError } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", row.id);

    if (!updateError) {
      await refresh();
      return;
    }

    console.warn("软删除被 RLS 拒绝，尝试直接删除：", updateError);

    // 某些 Supabase RLS UPDATE 策略只允许 deleted_at 为 null，
    // 这种情况下 UPDATE 会报“new row violates row-level security policy”。
    // 若 DELETE 策略允许，则直接删除源记录，同时保留刚刚写入的回收站记录。
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq("id", row.id);

    if (!deleteError) {
      await refresh();
      return;
    }

    // 两种删除方式都失败，删除刚刚创建的回收站记录，避免产生“假回收站”。
    if (trashRow?.id) {
      await supabase
        .from("trash")
        .delete()
        .eq("id", trashRow.id);
    }

    console.error("删除失败：", updateError, deleteError);
    alert(
      "删除失败。Supabase 当前的 RLS 策略同时阻止了修改/删除该记录。\n\n" +
      "软删除：" + updateError.message + "\n\n" +
      "直接删除：" + deleteError.message
    );
  };

  const addEntry = async (payload) => {
    if (!supabase || !session?.user?.id) return;

    const cleanPayload = {
      title: payload.title || "",
      content: payload.content || "",
      event_date: payload.event_date || today(),
      event_time: payload.event_time || null,
      event_type: payload.kind === "event" ? (payload.event_type || "date") : (payload.event_type || null),
      place: payload.place || "",
      kind: payload.kind || "note",
      owner_id: session.user.id
    };

    const { error } = await supabase.from("entries").insert(cleanPayload);
    if (error) {
      console.error("新增记录失败：", error);
      alert("新增失败：" + error.message);
      return;
    }

    setModal(null);
    await refresh();
  };

  const updateEntry = async (id, payload) => {
    if (!supabase || !session?.user?.id || !id) return;

    // 编辑时只更新真正可编辑的字段，绝不把 id、owner_id、created_at、deleted_at 等
    // 数据库字段从表单原样写回，避免 RLS/主键字段造成异常。
    const cleanPayload = {
      title: payload.title || "",
      content: payload.content || "",
      event_date: payload.event_date || today(),
      event_time: payload.event_time || null,
      event_type: payload.kind === "event" ? (payload.event_type || "date") : (payload.event_type || null),
      place: payload.place || "",
      kind: payload.kind || "note"
    };

    const { data, error } = await supabase
      .from("entries")
      .update(cleanPayload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (!error && data) {
      setModal(null);
      await refresh();
      return;
    }

    // 某些旧的 RLS 配置可能禁止 UPDATE，但允许 DELETE + INSERT。
    // 这时用“替换原记录”的方式完成编辑，保证不会留下旧版本。
    if (error) {
      console.warn("UPDATE 编辑被拒绝，尝试替换原记录：", error);

      const replacement = {
        ...cleanPayload,
        owner_id: session.user.id
      };

      const { error: deleteOldError } = await supabase
        .from("entries")
        .delete()
        .eq("id", id);

      if (!deleteOldError) {
        const { error: insertNewError } = await supabase
          .from("entries")
          .insert(replacement);

        if (!insertNewError) {
          setModal(null);
          await refresh();
          return;
        }

        // 插入新版本失败时，尽量恢复原记录。
        console.error("替换记录时新增失败：", insertNewError);
        alert("保存修改失败：" + insertNewError.message);
        await refresh();
        return;
      }

      console.error("编辑记录失败：", error, deleteOldError);
      alert("保存修改失败：" + error.message + "\n\n数据库 RLS 同时阻止了修改和替换原记录。");
      return;
    }

    alert("保存失败：没有找到要修改的原记录。请刷新页面后再试。");
  };

  const uploadPhoto = async ({
    file,
    caption,
    photo_date
  }) => {
    if (!file) {
      alert("请选择照片。");
      return;
    }

    if (!supabase || !session) {
      alert("Supabase 尚未连接，请检查 .env.local 和匿名登录设置。");
      return;
    }

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;

      console.log("开始上传照片：", path);

      const { error: uploadError } = await supabase
        .storage
        .from("love-media")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "image/jpeg"
        });

      if (uploadError) {
        console.error("Storage 上传失败：", uploadError);
        alert("照片上传失败：\n" + uploadError.message);
        return;
      }

      const { data: publicData } = supabase
        .storage
        .from("love-media")
        .getPublicUrl(path);

      const imageUrl = publicData.publicUrl;
      console.log("照片 URL：", imageUrl);

      const { error } = await supabase
        .from("photos")
        .insert({
          owner_id: session.user.id,
          image_url: imageUrl,
          caption,
          photo_date
        });

      if (error) {
        console.error("保存照片记录失败：", error);
        alert("照片记录保存失败：\n" + error.message);
        return;
      }

      setModal(null);
      await refresh();
    } catch (err) {
      console.error(err);
      alert("照片上传出现异常：\n" + err.message);
    }
  };

  const uploadBackground = async (file) => {
    if (!file || !supabase || !session) {
      alert("Supabase 尚未连接，请检查登录和环境变量。");
      return;
    }

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `background/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("love-media")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "image/jpeg"
        });

      if (uploadError) {
        console.error(uploadError);
        alert("背景图片上传失败：" + uploadError.message);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("love-media")
        .getPublicUrl(path);

      const backgroundUrl = publicData.publicUrl;

      const { data, error } = await supabase
        .from("site_settings")
        .upsert(
          {
            id: true,
            owner_id: session.user.id,
            site_title: settings.site_title,
            subtitle: settings.subtitle,
            accent: settings.accent,
            accent_2: settings.accent_2,
            paper: settings.paper,
            ink: settings.ink,
            background_url: backgroundUrl,
            pixel_scale: settings.pixel_scale || 4
          },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (error) {
        console.error(error);
        alert("背景地址保存失败：" + error.message);
        return;
      }

      setSettings(data);
      return data;
    } catch (err) {
      console.error(err);
      alert("背景图片处理失败：" + err.message);
    }
  };

  // 日历点击处理：优先跳转到有照片的相册筛选，否则跳事件簿
  const handleCalendarJump = (dateStr) => {
    const hasPhotos = photos.some(p => p.photo_date === dateStr);
    const hasEntries = entries.some(e => e.event_date === dateStr);

    if (hasPhotos) {
      setAlbumFilterDate(dateStr);
      setTab("album");
    } else {
      setCalendarDate(new Date(`${dateStr}T00:00:00`));
      setTab("events");
    }
  };

  const nav = [
    ["home", <Home size={18}/>, "首页"],
    ["calendar", <CalendarDays size={18}/>, "日历"],
    ["events", <FolderHeart size={18}/>, "事件簿"],
    ["album", <Camera size={18}/>, "相册"],
    ["board", <MessageCircleHeart size={18}/>, "留言板"],
    ["invite", <Heart size={18}/>, "约会邀请"],
    ["trash", <Trash2 size={18}/>, "回收站"]
  ];

  if (loading) return <div className="loading-screen"><div className="pixel-heart">♥</div><p>正在打开我们的小屋……</p></div>;

  return <div className="app" style={cssVars}>
    <header className="topbar">
      <div className="brand" onClick={() => setTab("home")}>
        <div className="brand-sprite">♥</div>
        <div><h1>{settings.site_title}</h1><small>{settings.subtitle}</small></div>
      </div>
      <div className="top-actions">
        <span className="online-dot">● 开放记录中</span>
        <button className="icon-btn" title="自定义" onClick={() => setModal("settings")}><Palette size={18}/></button>
      </div>
    </header>

    <div className="layout">
      <aside className="sidebar">
        <div className="side-label">MENU</div>
        {nav.map(([id, icon, label]) =>
          <button key={id} className={`nav-btn ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{icon}<span>{label}</span></button>
        )}
        <div className="sidebar-card">
          <Sparkles size={16}/><b>小提示</b>
          <span>删除的动态不会马上消失，而是会先进入回收站</span>
        </div>
      </aside>

      <main className="main">
        {tab === "home" && <HomeView settings={settings} entries={entries} photos={photos} onAdd={() => setModal("entry")} onPhoto={() => setModal("photo")} onOpen={setTab} onEdit={r => setModal({type:"edit-entry", row:r})} onDelete={softDelete} />}
        {tab === "calendar" && <CalendarView date={calendarDate} setDate={setCalendarDate} entries={entries} photos={photos} onJump={handleCalendarJump} />}
        {tab === "events" && <EventsView entries={entries.filter(x => x.kind === "event")} onAdd={() => setModal("event")} onEdit={r => setModal({type:"edit-entry", row:r})} onDelete={softDelete} />}
        {tab === "album" && <AlbumView photos={photos} onAdd={() => setModal("photo")} onDelete={softDelete} filterDate={albumFilterDate} onClearFilter={() => setAlbumFilterDate(null)} />}
        {tab === "board" && <BoardView entries={entries.filter(x => x.kind === "note")} onAdd={() => setModal("note")} onEdit={r => setModal({type:"edit-entry", row:r})} onDelete={softDelete} />}
        {tab === "invite" && <InviteView entries={entries.filter(x => x.kind === "invite")} onAdd={() => setModal("invite")} onEdit={r => setModal({type:"edit-entry", row:r})} onDelete={softDelete} />}
        {tab === "trash" && <TrashView trash={trash} refresh={refresh} />}
      </main>
    </div>

    {modal === "entry" && <EntryModal title="留下一条动态" kind="note" onClose={() => setModal(null)} onSave={addEntry} />}
    {modal === "note" && <EntryModal title="写一张留言" kind="note" onClose={() => setModal(null)} onSave={addEntry} />}
    {modal === "event" && <EntryModal title="记录一件小事" kind="event" onClose={() => setModal(null)} onSave={addEntry} />}
    {modal === "invite" && <EntryModal title="发出约会邀请" kind="invite" onClose={() => setModal(null)} onSave={addEntry} />}
    {modal?.type === "edit-entry" && <EntryModal title="编辑记录" initial={modal.row} kind={modal.row.kind} onClose={() => setModal(null)} onSave={p => updateEntry(modal.row.id, p)} />}
    {modal === "photo" && <PhotoModal onClose={() => setModal(null)} onSave={uploadPhoto} />}
    {modal === "settings" && <SettingsModal settings={settings} session={session} onClose={() => setModal(null)} onSaved={s => { setSettings(s); setModal(null); }} onUploadBackground={uploadBackground} />}
  </div>;
}

function HomeView({settings, entries, photos, onAdd, onPhoto, onOpen, onEdit, onDelete}) {
  const latest = entries.slice(0, 5);

  return <section>
    <div className="hero-card">
      <div>
        <span className="eyebrow">OUR LITTLE WORLD</span>
        <h2>今天，也值得被收藏</h2>
        <p>
          一本慢慢变厚的日记，放进约会、旅行和日常但温暖的小事们
        </p>

        <div className="hero-actions">
          <PixelButton onClick={onAdd}>
            <Plus size={16}/> 写下新动态
          </PixelButton>

          <PixelButton secondary onClick={onPhoto}>
            <ImagePlus size={16}/> 放一张照片
          </PixelButton>
        </div>
      </div>

      {/* =========================
          像素场景
         ========================= */}
      <div className="pixel-scene">
        {settings.background_url && (
          <div
            className="scene-background-image"
            style={{
              backgroundImage: `
                linear-gradient(
                  rgba(215,216,205,.35),
                  rgba(185,185,167,.35)
                ),
                url("${settings.background_url}")
              `,
              backgroundSize: "cover",
              backgroundPosition: "center bottom",
              backgroundRepeat: "no-repeat"
            }}
          />
        )}

        <div className="sun" style={{ position: "relative", zIndex: 10 }}>☼</div>
        <div className="hill h1" style={{ position: "relative", zIndex: 10 }} />
        <div className="hill h2" style={{ position: "relative", zIndex: 10 }} />
        <div className="house" style={{ position: "relative", zIndex: 10 }}>⌂</div>
      </div>
    </div>

    <div className="section-head">
      <div>
        <span className="eyebrow">RECENT</span>
        <h3>最近发生的事</h3>
      </div>

      <button className="text-btn" onClick={() => onOpen("events")}>
        查看全部 →
      </button>
    </div>

    <div className="timeline">
      {latest.length
        ? latest.map(r =>
            <TimelineItem key={r.id} row={r} onEdit={onEdit} onDelete={onDelete} />
          )
        : <Empty icon="✦" title="还没有记录哦" text="写下第一条动态，让小屋亮起来吧" />
      }
    </div>

    <div className="section-head">
      <div>
        <span className="eyebrow">MEMORIES</span>
        <h3>相册里的小瞬间</h3>
      </div>

      <button className="text-btn" onClick={() => onOpen("album")}>
        打开相册 →
      </button>
    </div>

    <div className="mini-gallery">
      {photos.slice(0, 4).map(p =>
        <img
          key={p.id}
          src={p.image_url}
          alt={p.caption || "memory"}
          style={{ objectFit: "contain", width: "100%", height: "100%" }}
        />
      )}

      {!photos.length &&
        <Empty icon="▧" title="还没有照片" text="上传一张照片，给这本日记加一点颜色" />
      }
    </div>
  </section>;
}

function TimelineItem({row, onEdit, onDelete}) {
  const icon = row.kind === "invite" ? "♡" : row.event_type ? (TYPES.find(x => x[0] === row.event_type)?.[2] || "✦") : "✎";
  return <article className="timeline-item">
    <div className="timeline-dot">{icon}</div>
    <div className="timeline-body">
      <div className="item-meta">{fmtDate(row.event_date)} {row.event_time ? `· ${row.event_time.slice(0,5)}` : ""}</div>
      <h4>{row.title}</h4>
      {row.content && <p>{row.content}</p>}
      {row.place && <span className="place"><MapPin size={13}/> {row.place}</span>}
    </div>
    <div className="item-actions"><button onClick={() => onEdit(row)}>编辑</button><button onClick={() => onDelete("entries", row)}>回收</button></div>
  </article>;
}

function CalendarView({date, setDate, entries, photos, onJump}) {
  /*
   * 日历核心规则：
   * 1. 月份的第一天、每个月天数全部按“纯日期”计算，不使用本地时区的午夜时间。
   * 2. 使用 UTC 只做星期计算，避免夏令时/时区导致同一个日期的星期发生漂移。
   * 3. 日历翻页时始终把 calendarDate 规范化为当月 1 日的中午时间，
   *    避免 Date 在不同环境下发生跨天。
   */
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime())
    ? date
    : new Date();

  const year = safeDate.getFullYear();
  const month = safeDate.getMonth();

  // 用 UTC 计算“当月 1 日是星期几”，结果不会受浏览器时区和夏令时影响。
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();

  // 用 UTC 计算当月实际天数。
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // 日历总格子补足到完整周，避免不同月份切换时布局异常。
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const marked = new Set([
    ...entries.map(x => x.event_date).filter(Boolean),
    ...photos.map(x => x.photo_date).filter(Boolean)
  ]);

  // 统一使用 YYYY-MM-DD 纯日期字符串，不让 Date 时区参与日期显示。
  const dateKey = day =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // 仅用于“今天”高亮，同样按本地年月日生成纯日期字符串。
  const now = new Date();
  const todayKey =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // 翻页时固定到目标月份的 1 日中午，避免 DST / 时区跨日问题。
  const changeMonth = offset => {
    const next = new Date(year, month + offset, 1, 12, 0, 0, 0);
    setDate(next);
  };

  const goToday = () => {
    // 先让日历本身回到现实中的当前月份，再执行原有跳转逻辑。
    setDate(new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0));
    onJump(todayKey);
  };

  return <section>
    <PageTitle
      eyebrow="CALENDAR"
      title="我们的时间轴"
      action={<PixelButton onClick={goToday}>回到今天</PixelButton>}
    />

    <div className="calendar-card">
      <div className="calendar-head">
        <button
          className="icon-btn"
          onClick={() => changeMonth(-1)}
          aria-label="上个月"
        >
          <ChevronLeft/>
        </button>

        <h2>{year} / {String(month + 1).padStart(2, "0")}</h2>

        <button
          className="icon-btn"
          onClick={() => changeMonth(1)}
          aria-label="下个月"
        >
          <ChevronRight/>
        </button>
      </div>

      <div className="weekdays">
        {["日", "一", "二", "三", "四", "五", "六"].map(x =>
          <b key={x}>{x}</b>
        )}
      </div>

      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} aria-hidden="true"/>;
          }

          const key = dateKey(day);
          const isMarked = marked.has(key);
          const isToday = key === todayKey;

          return (
            <button
              key={key}
              className={`day ${isMarked ? "marked" : ""} ${isToday ? "today" : ""}`}
              onClick={() => onJump(key)}
            >
              <span>{day}</span>
              {isMarked && <i>♥</i>}
            </button>
          );
        })}
      </div>
    </div>

    <div className="calendar-hint">
      <CalendarDays size={18}/>
      点击有爱心标记的日期，可跳转查看当天记录
    </div>
  </section>;
}

function EventsView({entries, onAdd, onEdit, onDelete}) {
  // 事件簿只展示事件记录。对历史数据做兼容：
  // 只要 event_type 属于六种分类之一就进入对应文件夹；缺失/异常值进入“其他”。
  const eventEntries = entries.filter(x => x.kind === "event");
  const validTypeIds = new Set(TYPES.map(x => x[0]));
  const normalizedEventType = row =>
    validTypeIds.has(row.event_type) ? row.event_type : "other";

  const grouped = TYPES.map(([id,label]) => [
    id,
    label,
    eventEntries.filter(x => normalizedEventType(x) === id)
  ]);

  return <section>
    <PageTitle eyebrow="EVENT BOOK" title="事件簿" action={<PixelButton onClick={onAdd}><Plus size={16}/> 新事件</PixelButton>}/>
    <div className="folder-grid">
      {grouped.map(([id,label,list]) => <div className="folder-card" key={id}>
        <div className="folder-tab">{label}</div><div className="folder-icon">{TYPES.find(x=>x[0]===id)?.[2]}</div><strong>{list.length} 条记录</strong>
        <div className="folder-preview">{list.slice(0,3).map(r => <button key={r.id} onClick={() => onEdit(r)}>{r.title}<span>{fmtDate(r.event_date)}</span></button>)}</div>
        {!list.length && <small>这个文件夹还很轻……</small>}
      </div>)}
    </div>
    <div className="stack-list">{eventEntries.map(r => <TimelineItem key={r.id} row={r} onEdit={onEdit} onDelete={onDelete}/>)}</div>
  </section>;
}

function AlbumView({photos, onAdd, onDelete, filterDate, onClearFilter}) {
  // 排序：按 photo_date 降序，确保最新在前（同时兼容缺失日期）
  const sortedPhotos = [...photos].sort((a, b) => {
    const da = a.photo_date || "";
    const db = b.photo_date || "";
    return db.localeCompare(da);
  });

  const displayedPhotos = filterDate
    ? sortedPhotos.filter(p => p.photo_date === filterDate)
    : sortedPhotos;

  return <section>
    <PageTitle
      eyebrow="PHOTO ALBUM"
      title={filterDate ? `${filterDate} 的照片` : "相册"}
      action={
        <div style={{ display: "flex", gap: "8px" }}>
          {filterDate && <PixelButton secondary onClick={onClearFilter}>清除日期筛选</PixelButton>}
          <PixelButton onClick={onAdd}><ImagePlus size={16}/> 上传照片</PixelButton>
        </div>
      }
    />
    {displayedPhotos.length ? (
      <div className="photo-grid">
        {displayedPhotos.map(p => (
          <figure key={p.id} className="photo-card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <img
              src={p.image_url}
              style={{ objectFit: "contain", width: "100%", height: "auto", maxHeight: "300px" }}
            />
            <figcaption>
              <span>{fmtDate(p.photo_date)}</span>
              <b>{p.caption || "没有写下说明"}</b>
              <button onClick={() => onDelete("photos", p)}><Trash2 size={14}/></button>
            </figcaption>
          </figure>
        ))}
      </div>
    ) : (
      <Empty icon="▧" title={filterDate ? "这一天还没有照片" : "相册还是空的"} text={filterDate ? "试试选择其他日期吧" : "上传照片时可以选择它属于哪一天哦"} />
    )}
  </section>;
}

function BoardView({entries, onAdd, onEdit, onDelete}) {
  return <section>
    <PageTitle eyebrow="MESSAGE BOARD" title="留言板" action={<PixelButton onClick={onAdd}><Plus size={16}/> 留下一句话</PixelButton>}/>
    <div className="note-grid">
      {entries.map(r => <article className="sticky-note" key={r.id}><span>{fmtDate(r.event_date)}</span><h3>{r.title}</h3><p>{r.content}</p><div><button onClick={() => onEdit(r)}>编辑</button><button onClick={() => onDelete("entries", r)}>回收</button></div></article>)}
      {!entries.length && <Empty icon="♡" title="还没有留言" text="可以写一句今天想对对方说的话"/>}
    </div>
  </section>;
}

function InviteView({entries, onAdd, onEdit, onDelete}) {
  return <section>
    <PageTitle eyebrow="DATE INVITATION" title="约会邀请" action={<PixelButton onClick={onAdd}><Heart size={16}/> 写邀请函</PixelButton>}/>
    <div className="invite-grid">
      {entries.map(r => <article className="invite-card" key={r.id}><div className="invite-top">YOU ARE INVITED ♥</div><h2>{r.title}</h2><div className="invite-row"><CalendarDays size={15}/>{fmtDate(r.event_date)} {r.event_time && `· ${r.event_time.slice(0,5)}`}</div><div className="invite-row"><MapPin size={15}/>{r.place || "等你一起决定"}</div><div className="invite-content">{r.content}</div><div className="invite-actions"><button onClick={() => onEdit(r)}>编辑</button><button onClick={() => onDelete("entries", r)}>回收</button></div></article>)}
      {!entries.length && <Empty icon="✉" title="还没有约会邀请" text="发出第一封电子邀请函吧(*^▽^*)"/>}
    </div>
  </section>;
}

function TrashView({trash, refresh}) {
  const restore = async item => {
    if (!supabase || !item) return;

    const payload = item.payload || {};
    const table = item.source_table;

    // 第一种情况：源记录仍然存在，只是被软删除。
    const { data: restoredRow, error: restoreUpdateError } = await supabase
      .from(table)
      .update({ deleted_at: null })
      .eq("id", item.source_id)
      .select("id")
      .maybeSingle();

    if (!restoreUpdateError && restoredRow) {
      await supabase.from("trash").delete().eq("id", item.id);
      await refresh();
      return;
    }

    // 第二种情况：删除时因为 RLS 无法 UPDATE，代码使用了 DELETE。
    // 此时源记录已经不存在，需要从回收站 payload 重新插回原表。
    const restoredPayload = {
      ...payload,
      id: item.source_id,
      owner_id: payload.owner_id || item.owner_id,
      deleted_at: null
    };

    const { error: insertError } = await supabase
      .from(table)
      .insert(restoredPayload);

    if (insertError) {
      console.error("恢复失败：", restoreUpdateError, insertError);
      alert("恢复失败：" + insertError.message);
      return;
    }

    await supabase.from("trash").delete().eq("id", item.id);
    await refresh();
  };
  const destroy = async item => {
    await supabase.from("trash").delete().eq("id", item.id);
    await refresh();
  };
  return <section>
    <PageTitle eyebrow="TRASH" title="回收站" action={<span className="muted">{trash.length} 项</span>}/>
    <div className="trash-list">{trash.map(t => <article key={t.id}><div><b>{t.payload?.title || t.payload?.caption || "已删除项目"}</b><span>{t.source_table === "photos" ? "照片" : "记录"} · {new Date(t.deleted_at).toLocaleString("zh-CN")}</span></div><div><PixelButton secondary onClick={() => restore(t)}><RotateCcw size={15}/> 恢复</PixelButton><button className="text-danger" onClick={() => destroy(t)}>永久删除</button></div></article>)}
      {!trash.length && <Empty icon="♧" title="回收站是空的" text="被回收的内容会出现在这里。"/>}
    </div>
  </section>;
}

function PageTitle({eyebrow,title,action}) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</div>;
}

function EntryModal({title, kind, initial, onClose, onSave}) {
  // 编辑时只提取表单需要的字段，避免把数据库的 id/owner_id/时间戳等字段带回 update。
  // kind 固定使用当前页面传入的类型，避免事件编辑后被错误写成 note。
  const makeForm = value => ({
    title: value?.title || "",
    content: value?.content || "",
    event_date: value?.event_date || today(),
    event_time: value?.event_time ? value.event_time.slice(0, 5) : "",
    event_type: value?.event_type || (kind === "event" ? "date" : ""),
    place: value?.place || ""
  });

  const [form, setForm] = useState(() => makeForm(initial));
  const set = (k,v) => setForm(f => ({...f,[k]:v}));
  return <Modal title={title} onClose={onClose}>
    <form className="form" onSubmit={e => { e.preventDefault(); onSave({...form, kind}); }}>
      <label>标题<input required value={form.title} onChange={e=>set("title",e.target.value)} placeholder="比如：第一次约会"/></label>
      <div className="two-col"><label>日期<input type="date" required value={form.event_date} onChange={e=>set("event_date",e.target.value)}/></label><label>时间<input type="time" value={form.event_time || ""} onChange={e=>set("event_time",e.target.value)}/></label></div>
      {kind === "event" && <label>事件类型<select value={form.event_type || "date"} onChange={e=>set("event_type",e.target.value)}>{TYPES.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select></label>}
      {kind === "invite" && <label>地点<input value={form.place || ""} onChange={e=>set("place",e.target.value)} placeholder="比如：江上的晚霞"/></label>}
      <label>{kind === "invite" ? "约会内容" : "内容"}<textarea value={form.content || ""} onChange={e=>set("content",e.target.value)} placeholder="写点只有你们会懂的话……"/></label>
      <div className="modal-actions"><PixelButton secondary onClick={onClose}>取消</PixelButton><PixelButton type="submit"><Send size={15}/> 保存</PixelButton></div>
    </form>
  </Modal>;
}

function PhotoModal({onClose,onSave}) {
  const [file,setFile] = useState(null), [caption,setCaption] = useState(""), [date,setDate] = useState(today()), [preview,setPreview] = useState("");
  const pick = e => { const f=e.target.files?.[0]; if(!f)return; setFile(f); setPreview(URL.createObjectURL(f)); };
  return <Modal title="放进相册" onClose={onClose}>
    <form className="form" onSubmit={e=>{e.preventDefault();onSave({file,caption,photo_date:date})}}>
      <label className="dropzone" style={{ display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
        {preview
          ? <img src={preview} style={{ objectFit: "contain", width: "100%", height: "100%" }} />
          : <><ImagePlus size={30}/><b>选择一张照片</b><small>JPG / PNG / WEBP</small></>}
        <input type="file" accept="image/*" required onChange={pick} style={{ display: "none" }} />
      </label>
      <label>这张照片属于哪一天？<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label>照片说明<input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="例如：那天下雨了，但我们还是去了。"/></label>
      <div className="modal-actions"><PixelButton secondary onClick={onClose}>取消</PixelButton><PixelButton type="submit" disabled={!file}>上传</PixelButton></div>
    </form>
  </Modal>;
}

function SettingsModal({
  settings,
  session,
  onClose,
  onSaved,
  onUploadBackground
}) {
  const [form, setForm] = useState(settings);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [preview, setPreview] = useState(settings.background_url || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const pickBackground = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("请选择图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("背景图片不能超过 10 MB");
      return;
    }
    setBackgroundFile(file);
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
  };

  const save = async e => {
    e.preventDefault();
    if (!supabase || !session) {
      alert("Supabase 尚未连接，请检查 .env.local 和匿名登录设置");
      return;
    }
    setSaving(true);
    try {
      let nextForm = { ...form };
      if (backgroundFile) {
        setUploading(true);
        const uploaded = await onUploadBackground(backgroundFile);
        setUploading(false);
        if (!uploaded) {
          setSaving(false);
          return;
        }
        nextForm = uploaded;
      }
      const payload = {
        id: true,
        owner_id: session.user.id,
        site_title: nextForm.site_title,
        subtitle: nextForm.subtitle,
        accent: nextForm.accent,
        accent_2: nextForm.accent_2,
        paper: nextForm.paper,
        ink: nextForm.ink,
        background_url: nextForm.background_url || null,
        pixel_scale: nextForm.pixel_scale || 4
      };
      const { data, error } = await supabase
        .from("site_settings")
        .upsert(payload, { onConflict: "id" })
        .select()
        .single();
      if (error) {
        console.error("保存设置失败：", error);
        alert("保存失败：" + error.message);
        return;
      }
      onSaved(data);
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <Modal title="自定义小屋" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label>小屋名称<input value={form.site_title || ""} onChange={e => set("site_title", e.target.value)} placeholder="love-journal" /></label>
        <label>副标题<input value={form.subtitle || ""} onChange={e => set("subtitle", e.target.value)} placeholder="把幸福的时刻，一格一格收藏起来" /></label>
        <div className="color-row">
          {[["accent", "主色"], ["accent_2", "辅助色"], ["paper", "纸张色"], ["ink", "文字色"]].map(([k, l]) => (
            <label key={k}>{l}<input type="color" value={form[k] || "#ffffff"} onChange={e => set(k, e.target.value)} /></label>
          ))}
        </div>
        <label>背景图片
          <div className="background-upload">
            {preview ? <img src={preview} alt="背景预览" className="background-preview" style={{ objectFit: "contain", width: "100%", height: "auto" }} /> : <div className="background-empty">暂无背景图片</div>}
            <label className="pixel-btn secondary">
              <ImagePlus size={15}/>{uploading ? "正在上传……" : "选择新的背景图片"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickBackground} style={{ display: "none" }} />
            </label>
          </div>
        </label>
        <div className="theme-preview" style={{ backgroundColor: form.paper, color: form.ink }}>
          <div style={{ background: form.accent }}>♥</div>
          <span>这是你的小屋预览</span>
        </div>
        <p className="form-help">背景图片会上传到 Supabase Storage 的 love-media/background/ 文件夹，保存后会立即应用到网站顶部</p>
        <div className="modal-actions">
          <PixelButton secondary onClick={onClose} disabled={saving}>取消</PixelButton>
          <PixelButton type="submit" disabled={saving}>{saving ? "保存中……" : "保存外观"}</PixelButton>
        </div>
      </form>
    </Modal>
  );
}

/* ===== React 应用挂载 ===== */
const root = createRoot(document.getElementById("root"));
root.render(<App />);
