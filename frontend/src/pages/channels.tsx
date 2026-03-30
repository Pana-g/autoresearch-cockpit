import { useState } from "react";
import {
  useChannels,
  useChannelTypes,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useTestChannel,
  useValidateChannel,
} from "@/hooks/use-queries";
import type { NotificationChannel, NotificationEventType, ChannelTypeInfo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "@/lib/format";
import {
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  Bell,
  MessageSquare,
  Send,
  Hash,
  Globe,
  TestTube,
  Power,
  HelpCircle,
  ExternalLink,
  X,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

/* ── Constants ────────────────────────────────────────── */

const CHANNEL_ICONS: Record<string, typeof MessageSquare> = {
  discord: MessageSquare,
  telegram: Send,
  slack: Hash,
  webhook: Globe,
};

const CHANNEL_COLORS: Record<string, string> = {
  discord: "text-indigo-400",
  telegram: "text-sky-400",
  slack: "text-emerald-400",
  webhook: "text-amber-400",
};

const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  discord: "Webhook notifications + bot commands",
  telegram: "Bot API notifications + commands",
  slack: "Incoming webhook notifications",
  webhook: "POST JSON to any URL",
};

const SETUP_GUIDES: Record<string, { title: string; steps: string[]; link?: { label: string; url: string } }> = {
  discord: {
    title: "Discord Webhook Setup",
    steps: [
      "Open Discord and go to the channel you want notifications in.",
      "Click the gear icon (Edit Channel) → Integrations → Webhooks.",
      "Click \"New Webhook\", give it a name, and copy the Webhook URL.",
      "Paste the URL in the \"Webhook URL\" field below.",
    ],
    link: { label: "Discord Webhooks Docs", url: "https://support.discord.com/hc/en-us/articles/228383668" },
  },
  telegram: {
    title: "Telegram Bot Setup",
    steps: [
      "Open Telegram and search for @BotFather.",
      "Send /newbot and follow the prompts to create your bot.",
      "Copy the Bot Token that BotFather gives you.",
      "Add your bot to a group or start a DM with it.",
      "To find your Chat ID: send a message, then visit https://api.telegram.org/bot<TOKEN>/getUpdates and look for \"chat\":{\"id\": ...}.",
      "Paste the Bot Token and Chat ID in the fields below.",
    ],
    link: { label: "Telegram Bot API Docs", url: "https://core.telegram.org/bots/tutorial" },
  },
  slack: {
    title: "Slack Webhook Setup",
    steps: [
      "Go to https://api.slack.com/apps and click \"Create New App\" → \"From scratch\".",
      "Under Features → Incoming Webhooks, toggle it on.",
      "Click \"Add New Webhook to Workspace\" and select a channel.",
      "Copy the Webhook URL and paste it in the field below.",
    ],
    link: { label: "Slack Webhooks Docs", url: "https://api.slack.com/messaging/webhooks" },
  },
  webhook: {
    title: "Generic Webhook Setup",
    steps: [
      "Enter any URL that accepts POST requests with a JSON body.",
      "Optionally add a secret — requests will include an X-Signature-256 HMAC header for verification.",
      "The payload includes: event type, project name, run details, and event-specific data.",
      "Use services like Zapier, n8n, or a custom endpoint to receive notifications.",
    ],
  },
};

const EVENT_LABELS: Record<NotificationEventType, { label: string; description: string; icon: string }> = {
  new_best: { label: "New Best Score", description: "When a new best validation score is achieved", icon: "🏆" },
  training_failed: { label: "Training Failed", description: "When a training run fails", icon: "⚠️" },
  run_completed: { label: "Run Completed", description: "When a run finishes successfully", icon: "✅" },
  run_failed: { label: "Run Failed", description: "When a run enters the failed state", icon: "❌" },
  patch_ready: { label: "Patch Ready", description: "When a patch is ready for review", icon: "📋" },
  iteration_started: { label: "Iteration Started", description: "When a new agent iteration begins", icon: "🔄" },
  run_canceled: { label: "Run Canceled", description: "When a run is canceled", icon: "🛑" },
};

const ALL_EVENT_TYPES: NotificationEventType[] = [
  "new_best", "training_failed", "run_completed", "run_failed",
  "patch_ready", "iteration_started", "run_canceled",
];

const DEFAULT_EVENTS: NotificationEventType[] = [
  "new_best", "training_failed", "run_completed", "run_failed",
];

/* ── Main Page ────────────────────────────────────────── */

export default function ChannelsPage() {
  const { data: channelList } = useChannels();
  const { data: channelTypes } = useChannelTypes();
  const createChannel = useCreateChannel();
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const testChannel = useTestChannel();
  const validateChannel = useValidateChannel();

  const [showCreate, setShowCreate] = useState(false);
  const [editChannel, setEditChannel] = useState<NotificationChannel | null>(null);
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [selectedEvents, setSelectedEvents] = useState<NotificationEventType[]>(DEFAULT_EVENTS);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [validating, setValidating] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [setupGuide, setSetupGuide] = useState<string | null>(null);

  const currentTypeInfo = channelTypes?.find((t) => t.name === channelType);

  const resetForm = () => {
    setName("");
    setChannelType("");
    setConfig({});
    setSelectedEvents(DEFAULT_EVENTS);
    setEditChannel(null);
  };

  const openEdit = (ch: NotificationChannel) => {
    setEditChannel(ch);
    setName(ch.name);
    setChannelType(ch.channel_type);
    setSelectedEvents(ch.notification_events);
    setConfig({});
    setShowCreate(true);
  };

  const handleTypeChange = (v: string) => {
    setChannelType(v);
    setConfig({});
  };

  const toggleEvent = (evt: NotificationEventType) => {
    setSelectedEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]
    );
  };

  const handleSave = () => {
    if (!name || (!editChannel && !channelType)) return;

    if (editChannel) {
      const body: Parameters<typeof updateChannel.mutate>[0] = {
        id: editChannel.id,
        name,
        notification_events: selectedEvents,
      };
      if (Object.keys(config).length > 0) {
        body.config = config;
      }
      updateChannel.mutate(body, {
        onSuccess: () => {
          toast.success(`Channel "${name}" updated`);
          setShowCreate(false);
          resetForm();
        },
        onError: (err) => toast.error(`Failed to update: ${err.message}`),
      });
    } else {
      createChannel.mutate(
        {
          name,
          channel_type: channelType,
          config,
          notification_events: selectedEvents,
        },
        {
          onSuccess: async (ch) => {
            toast.success(`Channel "${name}" created`);
            setShowCreate(false);
            resetForm();
            // Auto-validate
            setValidating((s) => ({ ...s, [ch.id]: true }));
            try {
              const result = await validateChannel.mutateAsync(ch.id);
              if (result.valid) {
                toast.success(`${ch.name} connection verified`);
              } else {
                toast.error(`${ch.name} saved but connection failed — check config`);
              }
            } catch {
              toast.error(`${ch.name} saved but validation failed`);
            }
            setValidating((s) => ({ ...s, [ch.id]: false }));
          },
          onError: (err) => toast.error(`Failed to create: ${err.message}`),
        }
      );
    }
  };

  const handleTest = async (id: string) => {
    setTesting((s) => ({ ...s, [id]: true }));
    try {
      await testChannel.mutateAsync(id);
      toast.success("Test notification sent!");
    } catch (err: unknown) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setTesting((s) => ({ ...s, [id]: false }));
  };

  const handleValidate = async (id: string) => {
    setValidating((s) => ({ ...s, [id]: true }));
    try {
      const result = await validateChannel.mutateAsync(id);
      if (result.valid) {
        toast.success("Connection verified!");
      } else {
        toast.error("Connection failed — check config");
      }
    } catch {
      toast.error("Validation failed");
    }
    setValidating((s) => ({ ...s, [id]: false }));
  };

  const handleToggleActive = (ch: NotificationChannel) => {
    updateChannel.mutate(
      { id: ch.id, is_active: !ch.is_active },
      {
        onSuccess: () =>
          toast.success(`${ch.name} ${ch.is_active ? "disabled" : "enabled"}`),
      }
    );
  };

  // Group by channel type
  const grouped = new Map<string, NotificationChannel[]>();
  channelList?.forEach((ch) => {
    const list = grouped.get(ch.channel_type) ?? [];
    list.push(ch);
    grouped.set(ch.channel_type, list);
  });

  const canSave = name && (editChannel || (channelType && currentTypeInfo?.config_fields.filter((f) => f.required).every((f) => config[f.key])));

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notification Channels</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure Discord, Telegram, Slack, and webhooks for run notifications & remote commands
          </p>
        </div>
        <Button
          onClick={() => {
            if (showCreate) {
              setShowCreate(false);
              resetForm();
            } else {
              resetForm();
              setShowCreate(true);
            }
          }}
          className="gap-2 bg-primary/90 hover:bg-primary text-primary-foreground shadow-sm active:scale-95 transition-all"
        >
          <Plus className="h-4 w-4" /> Add Channel
        </Button>
      </motion.div>

      {/* Create / Edit Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-xl p-5 space-y-4">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">
                {editChannel ? "Edit Channel" : "New Channel"}
              </p>

              <Input
                placeholder="Channel name (e.g. my-discord)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm bg-muted/50 border-border focus:border-primary/40 transition-colors"
              />

              {/* Channel type selector — hidden in edit mode */}
              {!editChannel && (
                <div className="flex items-center gap-2">
                  <Select value={channelType} onValueChange={(v) => v && handleTypeChange(v)}>
                    <SelectTrigger className="h-10 w-full sm:w-72 text-sm bg-muted/50 border-border">
                      <SelectValue placeholder="Select channel type" />
                    </SelectTrigger>
                    <SelectContent className="w-[var(--radix-select-trigger-width)] sm:w-72">
                      {channelTypes?.map((t) => {
                        const Icon = CHANNEL_ICONS[t.name] ?? Globe;
                        return (
                          <SelectItem key={t.name} value={t.name} className="text-sm py-2.5">
                            <span className="flex items-center gap-2.5">
                              <Icon className={`h-4 w-4 ${CHANNEL_COLORS[t.name] ?? ""}`} />
                              <span className="flex flex-col">
                                <span className="font-medium">{t.label}</span>
                                <span className="text-[11px] text-muted-foreground">{CHANNEL_DESCRIPTIONS[t.name]}</span>
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {channelType && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 px-3 text-xs gap-1.5 text-muted-foreground hover:text-primary shrink-0"
                      onClick={() => setSetupGuide(channelType)}
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                      Setup Guide
                    </Button>
                  )}
                </div>
              )}

              {/* Setup guide for editing existing channel */}
              {editChannel && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs gap-1.5 text-muted-foreground hover:text-primary w-fit"
                  onClick={() => setSetupGuide(editChannel.channel_type)}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  {editChannel.channel_type.charAt(0).toUpperCase() + editChannel.channel_type.slice(1)} Setup Guide
                </Button>
              )}

              {/* Dynamic config fields */}
              {currentTypeInfo && (
                <div className="space-y-3">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                    Configuration
                  </p>
                  {currentTypeInfo.config_fields.map((field) => (
                    <div key={field.key}>
                      <label className="text-xs text-muted-foreground mb-1 block">{field.label}</label>
                      <Input
                        type={field.type === "password" ? "password" : "text"}
                        placeholder={field.placeholder}
                        value={config[field.key] ?? ""}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="h-9 text-sm font-mono bg-muted/50 border-border focus:border-primary/40 transition-colors"
                        autoComplete="off"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Notification event toggles */}
              {(channelType || editChannel) && (
                <div className="space-y-3">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                    Notification Events
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {ALL_EVENT_TYPES.map((evt) => {
                      const info = EVENT_LABELS[evt];
                      const active = selectedEvents.includes(evt);
                      return (
                        <button
                          key={evt}
                          onClick={() => toggleEvent(evt)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-all ${
                            active
                              ? "bg-primary/10 border border-primary/20 text-foreground"
                              : "bg-muted/50 border border-border text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          <span className="text-base">{info.icon}</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-xs block">{info.label}</span>
                            <span className="text-[11px] text-muted-foreground block">{info.description}</span>
                          </div>
                          <Switch
                            checked={active}
                            onCheckedChange={() => toggleEvent(evt)}
                            className="scale-75"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowCreate(false); resetForm(); }}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!canSave || createChannel.isPending || updateChannel.isPending}
                  onClick={handleSave}
                  className="text-xs gap-1 bg-primary/90 hover:bg-primary active:scale-95 transition-all"
                >
                  {(createChannel.isPending || updateChannel.isPending) && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  {editChannel ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Channel List */}
      {!channelList?.length && !showCreate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-xl p-12 text-center"
        >
          <Bell className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No notification channels configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a Discord webhook, Telegram bot, or Slack webhook to get notified about your runs
          </p>
        </motion.div>
      )}

      {Array.from(grouped.entries()).map(([type, channels]) => {
        const visible = channels.filter((ch) => ch.id !== editChannel?.id);
        if (visible.length === 0) return null;
        const Icon = CHANNEL_ICONS[type] ?? Globe;
        const color = CHANNEL_COLORS[type] ?? "text-muted-foreground";
        const desc = CHANNEL_DESCRIPTIONS[type] ?? type;
        return (
          <motion.div
            key={type}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-sm font-semibold capitalize">{type}</span>
              <span className="text-xs text-muted-foreground">— {desc}</span>
            </div>

            <div className="space-y-2">
              {visible.map((ch) => (
                <motion.div
                  key={ch.id}
                  layout
                  className={`glass rounded-xl px-5 py-4 flex items-center gap-4 group transition-all ${
                    ch.is_active ? "" : "opacity-50"
                  }`}
                >
                  {/* Status dot */}
                  <div
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      ch.is_active ? "bg-emerald-500 animate-pulse-dot" : "bg-zinc-500"
                    }`}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{ch.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {ch.notification_events.map((evt) => (
                        <span
                          key={evt}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                        >
                          {EVENT_LABELS[evt]?.icon} {evt}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Created {formatDistanceToNow(ch.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        disabled={validating[ch.id]}
                        onClick={() => handleValidate(ch.id)}
                      >
                        {validating[ch.id] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        Validate connection
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        disabled={testing[ch.id]}
                        onClick={() => handleTest(ch.id)}
                      >
                        {testing[ch.id] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                        Send test notification
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => handleToggleActive(ch)}
                      >
                        <Power className="h-4 w-4" />
                        {ch.is_active ? "Disable" : "Enable"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => openEdit(ch)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        className="gap-2 cursor-pointer"
                        onClick={() => setDeleteId(ch.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              ))}
            </div>
          </motion.div>
        );
      })}

      {/* Setup Guide Modal */}
      <AnimatePresence>
        {setupGuide && SETUP_GUIDES[setupGuide] && (() => {
          const guide = SETUP_GUIDES[setupGuide];
          const Icon = CHANNEL_ICONS[setupGuide] ?? Globe;
          const color = CHANNEL_COLORS[setupGuide] ?? "text-muted-foreground";
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              onClick={() => setSetupGuide(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
                className="glass rounded-xl p-6 max-w-lg w-full mx-4 space-y-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Icon className={`h-5 w-5 ${color}`} />
                    <h3 className="text-base font-semibold">{guide.title}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setSetupGuide(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <ol className="space-y-3">
                  {guide.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>

                {guide.link && (
                  <a
                    href={guide.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-2"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {guide.link.label}
                  </a>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => setSetupGuide(null)}
                  >
                    Got it
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Channel"
        description="This will remove the notification channel and stop any active command receivers. This action cannot be undone."
        onConfirm={() => {
          if (deleteId) {
            deleteChannel.mutate(deleteId, {
              onSuccess: () => {
                toast.success("Channel deleted");
                setDeleteId(null);
              },
              onError: (err) => toast.error(`Failed to delete: ${err.message}`),
            });
          }
        }}
        variant="destructive"
      />
    </div>
  );
}
