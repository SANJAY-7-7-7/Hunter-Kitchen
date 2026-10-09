import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api';
import { Order, AnalyticsSummary } from '../../types';
import {
  DollarSign,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  Star,
  Users,
  Bike,
  Flame,
  RefreshCw,
  UtensilsCrossed,
  TrendingUp,
  ChevronRight
} from 'lucide-react';

interface OwnerDashboardProps {
  onNavigateTab: (tab: string, filter?: string) => void;
  onSelectOrder: (orderId: string) => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({ onNavigateTab, onSelectOrder }) => {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const [analyticsData, ordersData] = await Promise.all([
        apiService.getAnalytics(),
        apiService.getOrders({ role: 'OWNER' })
      ]);
      setAnalytics(analyticsData);
      setRecentOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      if (manual) {
        setTimeout(() => setIsRefreshing(false), 600);
      }
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);

    // Instant real-time update when any order changes via SSE
    const handleOrderUpdate = () => {
      loadData();
    };
    window.addEventListener('hk:order_update', handleOrderUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('hk:order_update', handleOrderUpdate);
    };
  }, []);

  const pendingOrders = recentOrders.filter((o) => o.status === 'PLACED');
  const preparingOrders = recentOrders.filter(
    (o) => o.status === 'PREPARING' || o.status === 'ACCEPTED'
  );
  const readyOrders = recentOrders.filter((o) => o.status === 'READY');
  const onTheWayOrders = recentOrders.filter(
    (o) => o.status === 'OUT_FOR_DELIVERY' || o.status === 'PICKED_UP' || o.status === 'ASSIGNED'
  );

  return (
    <div className="pb-28 md:pb-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      {/* Top Owner Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-extrabold uppercase text-stone-400 tracking-wider">
            Restaurant Command Center
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900">Hunter's Kitchen</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer disabled:opacity-80 active:scale-95"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 transition-transform ${isRefreshing ? 'animate-spin text-stone-900' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Real-time KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs hover:shadow-xs transition-shadow">
          <p className="text-[10px] sm:text-xs font-extrabold text-stone-400 uppercase tracking-wider">Today's Revenue</p>
          <p className="text-xl sm:text-2xl font-black text-stone-900 mt-1">₹{analytics?.revenueToday || 0}</p>
          <span className="text-[11px] font-bold text-emerald-600 inline-block mt-1">Online &amp; COD</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs hover:shadow-xs transition-shadow">
          <p className="text-[10px] sm:text-xs font-extrabold text-stone-400 uppercase tracking-wider">Total Orders</p>
          <p className="text-xl sm:text-2xl font-black text-stone-900 mt-1">{analytics?.totalOrdersToday || 0}</p>
          <span className="text-[11px] text-stone-500 font-medium inline-block mt-1">Completed: {analytics?.completedOrders || 0}</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs hover:shadow-xs transition-shadow">
          <p className="text-[10px] sm:text-xs font-extrabold text-amber-600 uppercase tracking-wider">Pending New</p>
          <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1">{pendingOrders.length}</p>
          <span className="text-[11px] text-amber-700 font-medium inline-block mt-1">Needs Action</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs hover:shadow-xs transition-shadow">
          <p className="text-[10px] sm:text-xs font-extrabold text-stone-400 uppercase tracking-wider">Avg Rating</p>
          <p className="text-xl sm:text-2xl font-black text-stone-900 mt-1 flex items-center gap-1.5">
            <Star className="w-5 h-5 fill-amber-500 text-amber-500" /> {analytics?.avgRating && analytics.avgRating > 0 ? analytics.avgRating.toFixed(1) : '5.0'}
          </p>
          <span className="text-[11px] text-stone-500 font-medium inline-block mt-1">
            {analytics?.avgRating && analytics.avgRating > 0 ? 'Customer Feedback' : 'Customer Feedback'}
          </span>
        </div>
      </div>

      {/* Urgent Incoming Orders Warning Banner */}
      {pendingOrders.length > 0 && (
        <div
          onClick={() => onNavigateTab('owner_orders', 'PLACED')}
          className="bg-amber-500 text-stone-950 p-4 sm:p-5 rounded-2xl flex items-center justify-between cursor-pointer shadow-md hover:bg-amber-400 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-stone-950 text-amber-400 flex items-center justify-center font-bold shrink-0">
              <Flame className="w-6 h-6 fill-amber-400" />
            </div>
            <div>
              <h4 className="font-black text-sm sm:text-base text-stone-950">
                {pendingOrders.length} New Incoming Order{pendingOrders.length > 1 ? 's' : ''}!
              </h4>
              <p className="text-xs text-stone-900 font-medium">Click to review, accept or reject immediately.</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-stone-950 shrink-0" />
        </div>
      )}

      {/* Responsive 2-column or 3-column Layout for Laptop / PC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Operational Pipeline */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-xs sm:text-sm text-stone-900 uppercase tracking-wider">
              Live Operational Pipeline
            </h3>
            <button
              onClick={() => onNavigateTab('owner_orders', 'ALL')}
              className="text-xs font-bold text-stone-600 hover:text-red-700 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <span>View All Orders</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            {/* Preparing Card */}
            <div
              onClick={() => onNavigateTab('owner_orders', 'PREPARING')}
              className="p-3 sm:p-4.5 rounded-2xl bg-stone-50/80 hover:bg-amber-50/50 border border-stone-200/90 hover:border-amber-300/80 cursor-pointer transition-all duration-200 hover:shadow-xs hover:-translate-y-0.5 group text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-100/80 text-amber-700 border border-amber-200/60 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
              </div>
              <div className="mt-2.5 sm:mt-3">
                <p className="text-xl sm:text-2xl font-black text-stone-900 font-mono tracking-tight group-hover:text-amber-700 transition-colors">
                  {preparingOrders.length}
                </p>
                <p className="text-xs font-bold text-stone-800 group-hover:text-amber-900 mt-0.5 whitespace-nowrap">
                  Preparing
                </p>
                <p className="text-[11px] text-stone-400 font-medium hidden sm:block mt-0.5">
                  In kitchen queue
                </p>
              </div>
            </div>

            {/* Ready Card */}
            <div
              onClick={() => onNavigateTab('owner_orders', 'READY')}
              className="p-3 sm:p-4.5 rounded-2xl bg-stone-50/80 hover:bg-emerald-50/50 border border-stone-200/90 hover:border-emerald-300/80 cursor-pointer transition-all duration-200 hover:shadow-xs hover:-translate-y-0.5 group text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-100/80 text-emerald-700 border border-emerald-200/60 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2.5 sm:mt-3">
                <p className="text-xl sm:text-2xl font-black text-stone-900 font-mono tracking-tight group-hover:text-emerald-700 transition-colors">
                  {readyOrders.length}
                </p>
                <p className="text-xs font-bold text-stone-800 group-hover:text-emerald-900 mt-0.5 whitespace-nowrap">
                  Ready
                </p>
                <p className="text-[11px] text-stone-400 font-medium hidden sm:block mt-0.5">
                  Ready for pickup
                </p>
              </div>
            </div>

            {/* On The Road Card */}
            <div
              onClick={() => onNavigateTab('owner_orders', 'OUT_FOR_DELIVERY')}
              className="p-3 sm:p-4.5 rounded-2xl bg-stone-50/80 hover:bg-blue-50/50 border border-stone-200/90 hover:border-blue-300/80 cursor-pointer transition-all duration-200 hover:shadow-xs hover:-translate-y-0.5 group text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-100/80 text-blue-700 border border-blue-200/60 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                <Bike className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2.5 sm:mt-3">
                <p className="text-xl sm:text-2xl font-black text-stone-900 font-mono tracking-tight group-hover:text-blue-700 transition-colors">
                  {onTheWayOrders.length}
                </p>
                <p className="text-xs font-bold text-stone-800 group-hover:text-blue-900 mt-0.5 whitespace-nowrap">
                  On Road
                </p>
                <p className="text-[11px] text-stone-400 font-medium hidden sm:block mt-0.5">
                  Out for delivery
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Quick Navigation Cards */}
        <div className="space-y-3">
          {/* Manage Menu Card */}
          <button
            onClick={() => onNavigateTab('owner_menu')}
            className="w-full p-4 rounded-2xl bg-white hover:bg-stone-50/90 border border-stone-200/90 hover:border-stone-300 text-left shadow-2xs hover:shadow-xs transition-all duration-200 group flex items-center gap-3.5 cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 border border-orange-200/60 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-orange-100/80 transition-all shadow-3xs">
              <UtensilsCrossed className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-stone-900 group-hover:text-red-700 transition-colors truncate">
                Manage Menu
              </h4>
              <p className="text-xs text-stone-500 mt-0.5 font-normal truncate">
                Add dishes, update prices &amp; availability
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-700 group-hover:translate-x-1 transition-all shrink-0" />
          </button>

          {/* Dish & Revenue Analytics Card */}
          <button
            onClick={() => onNavigateTab('owner_analytics')}
            className="w-full p-4 rounded-2xl bg-white hover:bg-stone-50/90 border border-stone-200/90 hover:border-stone-300 text-left shadow-2xs hover:shadow-xs transition-all duration-200 group flex items-center gap-3.5 cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-emerald-100/80 transition-all shadow-3xs">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-stone-900 group-hover:text-red-700 transition-colors truncate">
                Dish &amp; Revenue Analytics
              </h4>
              <p className="text-xs text-stone-500 mt-0.5 font-normal truncate">
                Sales trends, peak hours &amp; dish metrics
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-700 group-hover:translate-x-1 transition-all shrink-0" />
          </button>

          {/* Staff & Fleet Card */}
          <button
            onClick={() => onNavigateTab('owner_staff')}
            className="w-full p-4 rounded-2xl bg-white hover:bg-stone-50/90 border border-stone-200/90 hover:border-stone-300 text-left shadow-2xs hover:shadow-xs transition-all duration-200 group flex items-center gap-3.5 cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-indigo-100/80 transition-all shadow-3xs">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-stone-900 group-hover:text-red-700 transition-colors truncate">
                Staff &amp; Delivery Fleet
              </h4>
              <p className="text-xs text-stone-500 mt-0.5 font-normal truncate">
                Manage kitchen crew &amp; delivery drivers
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-700 group-hover:translate-x-1 transition-all shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
