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
  subtitle: "把我们的小日子，一格一格收藏起来。",
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
  return new Date().toISOString().slice(0, 10);
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

  const softDelete = async (table, row) => {
    if (!supabase) return;
    await supabase.from("trash").insert({
      owner_id: session.user.id, source_table: table, source_id: row.id, payload: row
    });
    await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    await refresh();
  };

  const addEntry = async (payload) => {
    if (!supabase) return;
    const { error } = await supabase.from("entries").insert({ ...payload, owner_id: session.user.id });
    if (error) alert(error.message); else { setModal(null); await refresh(); }
  };

  const updateEntry = async (id, payload) => {
    const { error } = await supabase.from("entries").update(payload).eq("id", id);
    if (error) alert(error.message); else { setModal(null); await refresh(); }
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
    alert(
      "Supabase 尚未连接，请检查 .env.local 和匿名登录设置。"
    );
    return;
  }

  try {

    const ext =
      file.name.split(".").pop()?.toLowerCase() || "jpg";

    const path =
      `${session.user.id}/${crypto.randomUUID()}.${ext}`;

    console.log("开始上传照片：", path);

    const {
      error: uploadError
    } = await supabase
      .storage
      .from("love-media")
      .upload(
        path,
        file,
        {
          upsert: false,
          contentType: file.type || "image/jpeg"
        }
      );

    if (uploadError) {
      console.error(
        "Storage 上传失败：",
        uploadError
      );

      alert(
        "照片上传失败：\n" +
        uploadError.message
      );

      return;
    }

    const {
      data: publicData
    } = supabase
      .storage
      .from("love-media")
      .getPublicUrl(path);

    const imageUrl =
      publicData.publicUrl;

    console.log(
      "照片 URL：",
      imageUrl
    );

    const {
      error
    } = await supabase
      .from("photos")
      .insert({
        owner_id: session.user.id,
        image_url: imageUrl,
        caption,
        photo_date
      });

    if (error) {

      console.error(
        "保存照片记录失败：",
        error
      );

      alert(
        "照片记录保存失败：\n" +
        error.message
      );

      return;
    }

    setModal(null);

    await refresh();

  } catch (err) {

    console.error(err);

    alert(
      "照片上传出现异常：\n" +
      err.message
    );
  }
};

const uploadBackground = async (file) => {
  if (!file || !supabase || !session) {
    alert("Supabase 尚未连接，请检查登录和环境变量。");
    return;
  }

  try {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";

    const path =
      `background/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } =
      await supabase.storage
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

    const {
      data: publicData
    } = supabase.storage
      .from("love-media")
      .getPublicUrl(path);

    const backgroundUrl = publicData.publicUrl;

    const { data, error } =
      await supabase
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
          {
            onConflict: "id"
          }
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
    <header
  className={`topbar ${settings.background_url ? "topbar-with-bg" : ""}`}
  style={
    settings.background_url
      ? {
          backgroundImage: `
            linear-gradient(
              rgba(250,247,242,.78),
              rgba(250,247,242,.78)
            ),
            url("${settings.background_url}")
          `,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }
      : undefined
  }
>
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
          <span>任何人都可以留下新的动态；删除不会马上消失，而是会先进入回收站。</span>
        </div>
      </aside>

      <main className="main">
        {tab === "home" && <HomeView entries={entries} photos={photos} onAdd={() => setModal("entry")} onPhoto={() => setModal("photo")} onOpen={setTab} onEdit={r => setModal({type:"edit-entry", row:r})} onDelete={softDelete} />}
        {tab === "calendar" && <CalendarView date={calendarDate} setDate={setCalendarDate} entries={entries} photos={photos} onJump={d => { setCalendarDate(new Date(`${d}T00:00:00`)); setTab("events"); }} />}
        {tab === "events" && <EventsView entries={entries.filter(x => x.kind === "event")} onAdd={() => setModal("event")} onEdit={r => setModal({type:"edit-entry", row:r})} onDelete={softDelete} />}
        {tab === "album" && <AlbumView photos={photos} onAdd={() => setModal("photo")} onDelete={softDelete} />}
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

function HomeView({entries, photos, onAdd, onPhoto, onOpen, onEdit, onDelete}) {
  const latest = entries.slice(0, 5);
  return <section>
    <div className="hero-card">
      <div>
        <span className="eyebrow">OUR LITTLE WORLD</span>
        <h2>今天，也值得被收藏。</h2>
        <p>像一本慢慢长大的像素日记，把约会、旅行、留言和那些只有我们懂的小事放进去。</p>
        <div className="hero-actions"><PixelButton onClick={onAdd}><Plus size={16}/> 写下新动态</PixelButton><PixelButton secondary onClick={onPhoto}><ImagePlus size={16}/> 放一张照片</PixelButton></div>
      </div>
      <div className="pixel-scene"><div className="sun">☼</div><div className="hill h1"/><div className="hill h2"/><div className="house">⌂</div></div>
    </div>

    <div className="section-head"><div><span className="eyebrow">RECENT</span><h3>最近发生的事</h3></div><button className="text-btn" onClick={() => onOpen("events")}>查看全部 →</button></div>
    <div className="timeline">
      {latest.length ? latest.map(r => <TimelineItem key={r.id} row={r} onEdit={onEdit} onDelete={onDelete}/>) :
        <Empty icon="✦" title="还没有记录" text="写下第一条动态，让小屋亮起来吧。"/>}
    </div>

    <div className="section-head"><div><span className="eyebrow">MEMORIES</span><h3>相册里的小瞬间</h3></div><button className="text-btn" onClick={() => onOpen("album")}>打开相册 →</button></div>
    <div className="mini-gallery">
      {photos.slice(0, 4).map(p => <img key={p.id} src={p.image_url} alt={p.caption || "memory"} />)}
      {!photos.length && <Empty icon="▧" title="还没有照片" text="上传一张照片，给这本日记加一点颜色。"/>}
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
  const year = date.getFullYear(), month = date.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({length: first + days}, (_, i) => i < first ? null : i - first + 1);
  const marked = new Set([...entries.map(x => x.event_date), ...photos.map(x => x.photo_date)]);
  const dateKey = d => `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  return <section>
    <PageTitle eyebrow="CALENDAR" title="我们的时间轴" action={<PixelButton onClick={() => onJump(today())}>回到今天</PixelButton>}/>
    <div className="calendar-card">
      <div className="calendar-head"><button className="icon-btn" onClick={() => setDate(new Date(year, month-1, 1))}><ChevronLeft/></button><h2>{year} / {String(month+1).padStart(2,"0")}</h2><button className="icon-btn" onClick={() => setDate(new Date(year, month+1, 1))}><ChevronRight/></button></div>
      <div className="weekdays">{["日","一","二","三","四","五","六"].map(x => <b key={x}>{x}</b>)}</div>
      <div className="calendar-grid">{cells.map((d,i) => d === null ? <div key={i}/> :
        <button key={d} className={`day ${marked.has(dateKey(d)) ? "marked" : ""} ${dateKey(d) === today() ? "today" : ""}`} onClick={() => onJump(dateKey(d))}>
          <span>{d}</span>{marked.has(dateKey(d)) && <i>♥</i>}
        </button>)}</div>
    </div>
    <div className="calendar-hint"><CalendarDays size={18}/> 点击有爱心标记的日期，可跳转查看当天记录。</div>
  </section>;
}

function EventsView({entries, onAdd, onEdit, onDelete}) {
  const grouped = TYPES.map(([id,label]) => [id,label,entries.filter(x => x.event_type === id)]);
  return <section>
    <PageTitle eyebrow="EVENT BOOK" title="事件簿" action={<PixelButton onClick={onAdd}><Plus size={16}/> 新事件</PixelButton>}/>
    <div className="folder-grid">
      {grouped.map(([id,label,list]) => <div className="folder-card" key={id}>
        <div className="folder-tab">{label}</div><div className="folder-icon">{TYPES.find(x=>x[0]===id)?.[2]}</div><strong>{list.length} 条记录</strong>
        <div className="folder-preview">{list.slice(0,3).map(r => <button key={r.id} onClick={() => onEdit(r)}>{r.title}<span>{fmtDate(r.event_date)}</span></button>)}</div>
        {!list.length && <small>这个文件夹还很轻。</small>}
      </div>)}
    </div>
    <div className="stack-list">{entries.map(r => <TimelineItem key={r.id} row={r} onEdit={onEdit} onDelete={onDelete}/>)}</div>
  </section>;
}

function AlbumView({photos, onAdd, onDelete}) {
  return <section>
    <PageTitle eyebrow="PHOTO ALBUM" title="相册" action={<PixelButton onClick={onAdd}><ImagePlus size={16}/> 上传照片</PixelButton>}/>
    {photos.length ? <div className="photo-grid">{photos.map(p => <figure key={p.id} className="photo-card"><img src={p.image_url}/><figcaption><span>{fmtDate(p.photo_date)}</span><b>{p.caption || "没有写下说明"}</b><button onClick={() => onDelete("photos", p)}><Trash2 size={14}/></button></figcaption></figure>)}</div> :
      <Empty icon="▧" title="相册还是空的" text="上传照片时可以选择它属于哪一天。"/>}
  </section>;
}

function BoardView({entries, onAdd, onEdit, onDelete}) {
  return <section>
    <PageTitle eyebrow="MESSAGE BOARD" title="留言板" action={<PixelButton onClick={onAdd}><Plus size={16}/> 留下一句话</PixelButton>}/>
    <div className="note-grid">
      {entries.map(r => <article className="sticky-note" key={r.id}><span>{fmtDate(r.event_date)}</span><h3>{r.title}</h3><p>{r.content}</p><div><button onClick={() => onEdit(r)}>编辑</button><button onClick={() => onDelete("entries", r)}>回收</button></div></article>)}
      {!entries.length && <Empty icon="♡" title="还没有留言" text="可以写一句今天想对对方说的话。"/>}
    </div>
  </section>;
}

function InviteView({entries, onAdd, onEdit, onDelete}) {
  return <section>
    <PageTitle eyebrow="DATE INVITATION" title="约会邀请" action={<PixelButton onClick={onAdd}><Heart size={16}/> 写邀请函</PixelButton>}/>
    <div className="invite-grid">
      {entries.map(r => <article className="invite-card" key={r.id}><div className="invite-top">YOU ARE INVITED ♥</div><h2>{r.title}</h2><div className="invite-row"><CalendarDays size={15}/>{fmtDate(r.event_date)} {r.event_time && `· ${r.event_time.slice(0,5)}`}</div><div className="invite-row"><MapPin size={15}/>{r.place || "等你一起决定"}</div><div className="invite-content">{r.content}</div><div className="invite-actions"><button onClick={() => onEdit(r)}>编辑</button><button onClick={() => onDelete("entries", r)}>回收</button></div></article>)}
      {!entries.length && <Empty icon="✉" title="还没有约会邀请" text="发出第一封像素邀请函吧。"/>}
    </div>
  </section>;
}

function TrashView({trash, refresh}) {
  const restore = async item => {
    const payload = item.payload;
    const table = item.source_table;
    await supabase.from(table).update({ deleted_at: null }).eq("id", item.source_id);
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
  const [form, setForm] = useState(initial || { title:"", content:"", event_date:today(), event_time:"", event_type:"date", place:"" });
  const set = (k,v) => setForm(f => ({...f,[k]:v}));
  return <Modal title={title} onClose={onClose}>
    <form className="form" onSubmit={e => { e.preventDefault(); onSave({...form, kind}); }}>
      <label>标题<input required value={form.title} onChange={e=>set("title",e.target.value)} placeholder="比如：第一次一起看海"/></label>
      <div className="two-col"><label>日期<input type="date" required value={form.event_date} onChange={e=>set("event_date",e.target.value)}/></label><label>时间<input type="time" value={form.event_time || ""} onChange={e=>set("event_time",e.target.value)}/></label></div>
      {kind === "event" && <label>事件类型<select value={form.event_type || "date"} onChange={e=>set("event_type",e.target.value)}>{TYPES.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select></label>}
      {kind === "invite" && <label>地点<input value={form.place || ""} onChange={e=>set("place",e.target.value)} placeholder="比如：江边的小餐馆"/></label>}
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
      <label className="dropzone">{preview ? <img src={preview}/> : <><ImagePlus size={30}/><b>选择一张照片</b><small>JPG / PNG / WEBP</small></>}<input type="file" accept="image/*" required onChange={pick}/></label>
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

  const set = (k, v) =>
    setForm(f => ({
      ...f,
      [k]: v
    }));

  const pickBackground = e => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("请选择图片文件。");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("背景图片不能超过 10 MB。");
      return;
    }

    setBackgroundFile(file);

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
  };

  const save = async e => {
    e.preventDefault();

    if (!supabase || !session) {
      alert(
        "Supabase 尚未连接，请检查 .env.local 和匿名登录设置。"
      );
      return;
    }

    setSaving(true);

    try {
      let nextForm = { ...form };

      /*
       * 如果选择了新的背景图片，
       * 先上传到 Storage。
       */
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

      /*
       * 保存网站颜色、标题等设置。
       */
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

      const {
        data,
        error
      } = await supabase
        .from("site_settings")
        .upsert(payload, {
          onConflict: "id"
        })
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

        <label>
          小屋名称
          <input
            value={form.site_title || ""}
            onChange={e =>
              set("site_title", e.target.value)
            }
            placeholder="love-journal"
          />
        </label>

        <label>
          副标题
          <input
            value={form.subtitle || ""}
            onChange={e =>
              set("subtitle", e.target.value)
            }
            placeholder="把我们的小日子，一格一格收藏起来。"
          />
        </label>

        <div className="color-row">
          {[
            ["accent", "主色"],
            ["accent_2", "辅助色"],
            ["paper", "纸张色"],
            ["ink", "文字色"]
          ].map(([k, l]) => (
            <label key={k}>
              {l}

              <input
                type="color"
                value={form[k] || "#ffffff"}
                onChange={e =>
                  set(k, e.target.value)
                }
              />
            </label>
          ))}
        </div>

        <label>
          背景图片

          <div className="background-upload">

            {preview ? (
              <img
                src={preview}
                alt="背景预览"
                className="background-preview"
              />
            ) : (
              <div className="background-empty">
                暂无背景图片
              </div>
            )}

            <label className="pixel-btn secondary">
              <ImagePlus size={15}/>
              {uploading
                ? "正在上传……"
                : "选择新的背景图片"}

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={pickBackground}
                style={{ display: "none" }}
              />
            </label>

          </div>
        </label>

        <div
          className="theme-preview"
          style={{
            backgroundColor: form.paper,
            color: form.ink
          }}
        >
          <div style={{ background: form.accent }}>
            ♥
          </div>

          <span>
            这是你的小屋预览
          </span>
        </div>

        <p className="form-help">
          背景图片会上传到 Supabase Storage 的
          love-media/background/ 文件夹。
          保存后会立即应用到网站顶部。
        </p>

        <div className="modal-actions">

          <PixelButton
            secondary
            onClick={onClose}
            disabled={saving}
          >
            取消
          </PixelButton>

          <PixelButton
            type="submit"
            disabled={saving}
          >
            {saving ? "保存中……" : "保存外观"}
          </PixelButton>

        </div>

      </form>

    </Modal>
  );
}
/* ===== React 应用挂载 ===== */
const root = createRoot(document.getElementById("root"));
root.render(<App />);
