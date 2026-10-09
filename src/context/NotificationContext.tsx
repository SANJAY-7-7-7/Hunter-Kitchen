import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppNotification, OrderStatus } from '../types';
import { apiService } from '../services/api';
import { useAuth } from './AuthContext';
import { Bell, CheckCircle2, Clock, Bike, AlertCircle, X, Utensils, ChefHat, ShoppingBag, Sparkles, Volume2 } from 'lucide-react';

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'ORDER' | 'SYSTEM' | 'SUCCESS' | 'INFO';
  status?: OrderStatus;
  orderId?: string;
  timestamp: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  toasts: ToastNotification[];
  webPushPermission: NotificationPermission;
  isPushAlertsEnabled: boolean;
  togglePushAlerts: (overrideState?: boolean) => Promise<void>;
  addNotification: (notif: { title: string; message: string; type?: 'ORDER' | 'SYSTEM' | 'SUCCESS' | 'INFO'; orderId?: string; status?: OrderStatus }) => void;
  triggerOrderStatusNotification: (orderNumber: string, oldStatus: OrderStatus, newStatus: OrderStatus, orderId: string) => void;
  requestWebPushPermission: () => Promise<boolean>;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  removeToast: (id: string) => void;
  fetchNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Web Audio API notification chime generator
const playNotificationChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Play double chime (C5 -> G5)
    const now = ctx.currentTime;
    
    // Note 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Note 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now + 0.12); // G5
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);

  } catch (e) {
    // Audio autoplay restrictions may prevent playback prior to user interaction
  }
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [webPushPermission, setWebPushPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [isPushAlertsEnabled, setIsPushAlertsEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hk_push_alerts_enabled');
      if (saved !== null) return saved === 'true';
    }
    return true;
  });

  const togglePushAlerts = async (overrideState?: boolean) => {
    const nextVal = overrideState !== undefined ? overrideState : !isPushAlertsEnabled;
    setIsPushAlertsEnabled(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hk_push_alerts_enabled', String(nextVal));
    }

    if (nextVal) {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
        await requestWebPushPermission();
      } else {
        addNotification({
          title: 'Push Alerts Enabled',
          message: 'Real-time order status alerts and sound notifications are active.',
          type: 'SUCCESS'
        });
      }
    } else {
      addNotification({
        title: 'Push Alerts Muted',
        message: 'Real-time order push notifications and sound chimes have been muted.',
        type: 'INFO'
      });
    }
  };

  // Track order statuses in memory to catch real-time status transitions across the app
  const orderStatusesRef = useRef<Record<string, OrderStatus>>({});
  const lastTriggeredStatusRef = useRef<Record<string, OrderStatus>>({});
  const recentToastsRef = useRef<Map<string, number>>(new Map());

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const fetchNotifications = async () => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }
    try {
      const data = await apiService.getNotifications(currentUser.id);
      if (Array.isArray(data)) {
        setNotifications(data);
      }
    } catch (err: any) {
      // If unauthorized, silent skip
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // Request Web Push Notification Permission
  const requestWebPushPermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Browser push notifications are not supported on this device.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setWebPushPermission(permission);

      if (permission === 'granted') {
        addNotification({
          title: 'Real-Time Alerts Active',
          message: 'You will now receive live status alerts when food orders update.',
          type: 'SUCCESS'
        });
        return true;
      } else {
        return false;
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      return false;
    }
  };

  // Continuous background monitoring of active customer orders for real-time push status alerts
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'CUSTOMER') return;

    let isMounted = true;

    const checkActiveOrdersStatus = async () => {
      if (!currentUser || currentUser.role !== 'CUSTOMER') return;
      try {
        const orders = await apiService.getOrders({ userId: currentUser.id, role: currentUser.role });
        if (!isMounted) return;
        if (Array.isArray(orders)) {
          orders.forEach((order) => {
            const prevStatus = orderStatusesRef.current[order.id];

            // If order was previously recorded and status changed
            if (prevStatus && prevStatus !== order.status) {
              triggerOrderStatusNotification(order.orderNumber, prevStatus, order.status, order.id);
            }

            // Update tracked status ref
            orderStatusesRef.current[order.id] = order.status;
          });
        }
      } catch (err: any) {
        // Silent skip background error
      }
    };

    // Initial check
    checkActiveOrdersStatus();

    // Poll every 5 seconds for real-time order push updates
    const interval = setInterval(checkActiveOrdersStatus, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser?.id, currentUser?.role]);

  // Real-Time Server-Sent Events (SSE) Stream Connection for instantaneous sync
  useEffect(() => {
    if (!currentUser) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const connectSSE = () => {
      if (isDisposed) return;
      try {
        eventSource = new EventSource('/api/events/stream', { withCredentials: true });

        const handleIncomingEvent = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            window.dispatchEvent(new CustomEvent('hk:order_update', { detail: data }));
          } catch {}
        };

        eventSource.onmessage = handleIncomingEvent;

        const eventTypes = [
          'ORDER_CREATED',
          'ORDER_ACCEPTED',
          'ORDER_REJECTED',
          'ORDER_PREPARING',
          'ORDER_READY',
          'ORDER_ASSIGNED',
          'ORDER_PICKED_UP',
          'ORDER_OUT_FOR_DELIVERY',
          'ORDER_DELIVERED',
          'ORDER_CANCELLED',
          'ORDER_STATUS_CHANGED',
          'PAYMENT_CAPTURED'
        ];

        eventTypes.forEach((evt) => {
          eventSource?.addEventListener(evt, handleIncomingEvent as EventListener);
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connectSSE, 4000);
          }
        };
      } catch (err) {
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connectSSE, 4000);
        }
      }
    };

    connectSSE();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
    };
  }, [currentUser?.id]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const cleanNotificationTitle = (titleStr: string): string => {
    return (
      titleStr
        .replace(/^[\p{Emoji}\u200d\uFE0F\s]+/u, '')
        .replace(/[\p{Emoji}\u200d\uFE0F\s]+$/u, '')
        .trim() || titleStr
    );
  };

  const addNotification = ({
    title,
    message,
    type = 'ORDER',
    orderId,
    status
  }: {
    title: string;
    message: string;
    type?: 'ORDER' | 'SYSTEM' | 'SUCCESS' | 'INFO';
    orderId?: string;
    status?: OrderStatus;
  }) => {
    const cleanTitle = cleanNotificationTitle(title);
    const cleanMsg = message.trim();

    // Deduplication check: drop duplicate notifications with identical title + message within 4 seconds
    const dedupeKey = `${cleanTitle.toLowerCase()}:::${cleanMsg.toLowerCase()}`;
    const now = Date.now();
    const lastTriggerTime = recentToastsRef.current.get(dedupeKey) || 0;
    if (now - lastTriggerTime < 4000) {
      return;
    }
    recentToastsRef.current.set(dedupeKey, now);

    // Clean old entries older than 10 seconds to keep memory minimal
    for (const [key, timestamp] of recentToastsRef.current.entries()) {
      if (now - timestamp > 10000) {
        recentToastsRef.current.delete(key);
      }
    }

    const toastId = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const newToast: ToastNotification = {
      id: toastId,
      title: cleanTitle,
      message: cleanMsg,
      type,
      status,
      orderId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setToasts((prev) => [newToast, ...prev].slice(0, 4));

    // Play chime sound & trigger haptic vibration + push notification if enabled
    if (isPushAlertsEnabled) {
      playNotificationChime();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }

      // Trigger Browser OS Web Push Notification if permission granted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new window.Notification(cleanTitle, {
            body: cleanMsg,
            tag: orderId || 'hunter_kitchen_notification',
            badge: '/favicon.ico'
          });
        } catch (e) {
          console.warn('Web Push Notification dispatch error:', e);
        }
      }
    }

    // Auto remove toast after 5 seconds
    setTimeout(() => {
      removeToast(toastId);
    }, 5000);

    // Also add to local notifications list
    if (currentUser) {
      const newNotif: AppNotification = {
        id: 'notif_' + Date.now(),
        userId: currentUser.id,
        userRole: currentUser.role,
        title: cleanTitle,
        message: cleanMsg,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
        orderId
      };
      setNotifications((prev) => [newNotif, ...prev]);
    }
  };

  const triggerOrderStatusNotification = (
    orderNumber: string,
    oldStatus: OrderStatus,
    newStatus: OrderStatus,
    orderId: string
  ) => {
    if (!isPushAlertsEnabled) return;
    if (oldStatus === newStatus) return;
    if (lastTriggeredStatusRef.current[orderId] === newStatus) return;

    lastTriggeredStatusRef.current[orderId] = newStatus;
    orderStatusesRef.current[orderId] = newStatus;

    let title = `Order Update #${orderNumber}`;
    let message = `Your order status changed to ${newStatus.replace(/_/g, ' ')}`;

    switch (newStatus) {
      case 'ACCEPTED':
        title = 'Order Accepted';
        message = `Kitchen accepted Order #${orderNumber} and is preparing to cook.`;
        break;
      case 'PREPARING':
        title = 'Kitchen Preparing Order';
        message = `Chefs are actively cooking your meal for Order #${orderNumber}.`;
        break;
      case 'READY':
        title = 'Order Ready for Pickup';
        message = `Order #${orderNumber} is packed and awaiting delivery agent.`;
        break;
      case 'ASSIGNED':
        title = 'Delivery Partner Assigned';
        message = `A delivery agent has been assigned to bring Order #${orderNumber}.`;
        break;
      case 'OUT_FOR_DELIVERY':
        title = 'Out for Delivery';
        message = `Your food for Order #${orderNumber} is on the way!`;
        break;
      case 'DELIVERED':
        title = 'Order Delivered';
        message = `Order #${orderNumber} has arrived! Enjoy your hot meal.`;
        break;
      case 'REJECTED':
        title = 'Order Rejected';
        message = `Order #${orderNumber} was rejected by the kitchen.`;
        break;
      case 'CANCELLED':
        title = 'Order Cancelled';
        message = `Order #${orderNumber} has been cancelled.`;
        break;
      default:
        break;
    }

    addNotification({
      title,
      message,
      type: 'ORDER',
      orderId,
      status: newStatus
    });
  };

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    try {
      await apiService.markNotificationRead(id);
    } catch (err) {
      console.error(err);
    }
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        toasts,
        webPushPermission,
        isPushAlertsEnabled,
        togglePushAlerts,
        addNotification,
        triggerOrderStatusNotification,
        requestWebPushPermission,
        markAsRead,
        clearAll,
        removeToast,
        fetchNotifications
      }}
    >
      {children}
      {/* Toast Render Overlay - Top center of screen with professional duration */}
      <aside 
        aria-label="Notifications" 
        className="fixed top-18 sm:top-20 left-1/2 -translate-x-1/2 z-[250] flex flex-col items-center gap-2.5 w-[calc(100%-2rem)] max-w-md sm:w-[440px] pointer-events-none"
      >
        {toasts.map((toast) => {
          const isDelivered = toast.status === 'DELIVERED' || toast.type === 'SUCCESS';
          const isInTransit = toast.status === 'OUT_FOR_DELIVERY' || toast.status === 'ASSIGNED';
          const isKitchen = toast.status === 'PREPARING' || toast.status === 'ACCEPTED';
          const isReady = toast.status === 'READY';
          const isAlert = toast.status === 'REJECTED' || toast.status === 'CANCELLED';

          let categoryLabel = 'Notification';
          let badgeClass = 'bg-stone-100 border-stone-200 text-stone-700';
          let progressClass = 'bg-stone-800';
          let IconComponent = Bell;

          if (isDelivered) {
            categoryLabel = toast.status === 'DELIVERED' ? 'Order Delivered' : 'Success';
            badgeClass = 'bg-emerald-50 border-emerald-200/80 text-emerald-600';
            progressClass = 'bg-emerald-500';
            IconComponent = CheckCircle2;
          } else if (isInTransit) {
            categoryLabel = toast.status === 'OUT_FOR_DELIVERY' ? 'In Transit' : 'Partner Assigned';
            badgeClass = 'bg-sky-50 border-sky-200/80 text-sky-600';
            progressClass = 'bg-sky-500';
            IconComponent = Bike;
          } else if (isKitchen) {
            categoryLabel = toast.status === 'PREPARING' ? 'Cooking' : 'Kitchen Accepted';
            badgeClass = 'bg-amber-50 border-amber-200/80 text-amber-600';
            progressClass = 'bg-amber-500';
            IconComponent = ChefHat;
          } else if (isReady) {
            categoryLabel = 'Order Ready';
            badgeClass = 'bg-emerald-50 border-emerald-200/80 text-emerald-600';
            progressClass = 'bg-emerald-500';
            IconComponent = ShoppingBag;
          } else if (isAlert) {
            categoryLabel = 'Order Alert';
            badgeClass = 'bg-rose-50 border-rose-200/80 text-rose-600';
            progressClass = 'bg-rose-500';
            IconComponent = AlertCircle;
          } else if (toast.type === 'ORDER') {
            categoryLabel = 'Live Order';
            badgeClass = 'bg-amber-50 border-amber-200/80 text-amber-600';
            progressClass = 'bg-amber-500';
            IconComponent = ShoppingBag;
          }

          return (
            <div
              key={toast.id}
              role="alert"
              className="pointer-events-auto bg-white/98 backdrop-blur-xl border border-stone-200/90 rounded-2xl p-3.5 shadow-xl shadow-stone-900/10 hover:shadow-2xl transition-all duration-300 relative overflow-hidden ring-1 ring-black/5 animate-in slide-in-from-top-3 fade-in duration-300"
            >
              <div className="flex items-start gap-3">
                {/* Icon Pill */}
                <div className={`p-2 rounded-xl shrink-0 mt-0.5 border ${badgeClass}`}>
                  <IconComponent className="w-4 h-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      {categoryLabel}
                    </span>
                    <span className="text-[10px] font-semibold text-stone-400 tabular-nums">
                      {toast.timestamp}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-stone-900 tracking-tight mt-0.5 leading-snug truncate">
                    {toast.title}
                  </h4>
                  <p className="text-xs text-stone-600 mt-1 leading-relaxed font-normal">
                    {toast.message}
                  </p>
                </div>

                {/* Dismiss button */}
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors shrink-0 -mr-1 -mt-1 cursor-pointer"
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Subtle 5-second progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-stone-100/80 overflow-hidden">
                <div className={`h-full ${progressClass} animate-toast-progress origin-left`} />
              </div>
            </div>
          );
        })}
      </aside>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
