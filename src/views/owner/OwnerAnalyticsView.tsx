import React, { useState, useEffect } from 'react';
import { AnalyticsSummary } from '../../types';
import { apiService } from '../../services/api';
import { 
  DollarSign, 
  BarChart3, 
  Star, 
  Flame, 
  Award, 
  TrendingUp, 
  RefreshCw, 
  Clock, 
  PieChart, 
  Layers, 
  CheckCircle2, 
  ChevronRight, 
  Calendar,
  Utensils
} from 'lucide-react';

export const OwnerAnalyticsView: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [sortKey, setSortKey] = useState<'UNITS' | 'REVENUE'>('UNITS');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'DISHES' | 'REVIEWS'>('OVERVIEW');
  const [selectedPoint, setSelectedPoint] = useState<{ day: string; revenue: number } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAnalytics = async (isSilent = false, isManual = false) => {
    if (!isSilent) setIsLoading(true);
    if (isManual) setIsRefreshing(true);
    try {
      const data = await apiService.getAnalytics();
      setAnalytics(data);
      // Set default selected point for the chart
      if (data && data.revenueByDay && data.revenueByDay.length > 0) {
        setSelectedPoint((prev) => {
          if (!prev) return data.revenueByDay[data.revenueByDay.length - 1];
          const matched = data.revenueByDay.find((d) => d.day === prev.day);
          return matched || data.revenueByDay[data.revenueByDay.length - 1];
        });
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      if (!isSilent) setIsLoading(false);
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 600);
      }
    }
  };

  useEffect(() => {
    loadAnalytics();
    const interval = setInterval(() => {
      loadAnalytics(true);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading || !analytics) {
    return (
      <div className="py-20 text-center text-stone-400 text-xs">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-red-600" />
        <p className="font-bold text-stone-700">Calculating Live Business Analytics...</p>
        <p className="text-[10px] text-stone-400 mt-1">Aggregating live food preps, reviews & courier statuses</p>
      </div>
    );
  }

  const sortedItemSales = [...(analytics.itemSales || [])].sort((a, b) =>
    sortKey === 'UNITS' ? b.unitsSold - a.unitsSold : b.revenue - a.revenue
  );

  // SVG Line Chart Calculations for Weekly Revenue
  const daysData = Array.isArray(analytics.revenueByDay) ? analytics.revenueByDay : [];
  const maxRevenue = Math.max(...(daysData.map(d => d.revenue) || [100]), 100);
  const chartHeight = 160;
  const paddingX = 40;
  const paddingY = 25;

  return (
    <div className="pb-32 md:pb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">Business Intelligence</h2>
          <p className="text-xs text-stone-500 mt-0.5">Live operational insights & food-chain diagnostics</p>
        </div>

        <button
          onClick={() => loadAnalytics(true, true)}
          disabled={isRefreshing}
          className="p-2.5 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 shadow-3xs transition-all active:scale-95 cursor-pointer shrink-0 disabled:opacity-80"
          title="Refresh Analytics"
        >
          <RefreshCw className={`w-4 h-4 text-stone-600 transition-transform ${isRefreshing ? 'animate-spin text-stone-900' : ''}`} />
        </button>
      </div>

      {/* Primary Analytics Tab Switchers */}
      <div className="grid grid-cols-3 bg-stone-100 p-1 rounded-xl border border-stone-200/80 gap-1 shadow-3xs">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 min-w-0 cursor-pointer ${
            activeTab === 'OVERVIEW'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Overview</span>
        </button>
        <button
          onClick={() => setActiveTab('DISHES')}
          className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 min-w-0 cursor-pointer ${
            activeTab === 'DISHES'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <Utensils className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Menu Insights</span>
        </button>
        <button
          onClick={() => setActiveTab('REVIEWS')}
          className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 min-w-0 cursor-pointer ${
            activeTab === 'REVIEWS'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <Star className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Feedback</span>
        </button>
      </div>

      {activeTab === 'OVERVIEW' && (
        <div className="space-y-4">
          {/* Executive Core Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Primary KPI Card: Today's Income */}
            <div className="bg-stone-900 text-white p-4 rounded-2xl shadow-sm border border-stone-800 relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                <DollarSign className="w-24 h-24 text-white" />
              </div>
              <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Today's Net Revenue</p>
              <p className="text-2xl font-black text-amber-400 mt-1">₹{analytics.revenueToday}</p>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-stone-300 font-medium">
                <span className="bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                  {analytics.totalOrdersToday} orders
                </span>
                <span>Active Today</span>
              </div>
            </div>

            {/* Kitchen Speed Metrics */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                <Clock className="w-24 h-24 text-stone-900" />
              </div>
              <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Avg Kitchen Prep Time</p>
              <p className="text-2xl font-black text-stone-900 mt-1">
                {analytics.avgPrepTimeMinutes > 0 ? analytics.avgPrepTimeMinutes : '0'} <span className="text-xs font-bold text-stone-500">mins</span>
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-stone-500 font-medium">
                <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-100">
                  {analytics.avgPrepTimeMinutes > 0 ? 'Target: <20m' : 'Standby'}
                </span>
                <span>{analytics.avgPrepTimeMinutes > 0 ? 'Highly efficient' : 'Awaiting live orders'}</span>
              </div>
            </div>

            {/* Monthly Earnings Card */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs">
              <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Actual Monthly Revenue</p>
              <p className="text-xl font-black text-stone-900 mt-1">₹{analytics.revenueMonthly}</p>
            </div>

            {/* Fleet Status */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs">
              <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Fleet & Staff Pool</p>
              <p className="text-xl font-black text-stone-900 mt-1">
                {analytics.activeDriverCount} <span className="text-xs font-bold text-stone-500">Online Riders</span>
              </p>
              <p className="text-[10px] text-stone-500 mt-1.5 font-medium">
                {analytics.activeStaffCount} active kitchen crew on duty
              </p>
            </div>
          </div>

          {/* Dynamic Interactive Weekly Sales Chart */}
          {daysData.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-3xs space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-extrabold text-stone-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-stone-600" /> Weekly Revenue Trend
                  </h3>
                  <p className="text-[10px] text-stone-400">Tap nodes to view specific daily totals</p>
                </div>
                
                {selectedPoint && (
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase text-stone-400">{selectedPoint.day}</p>
                    <p className="text-sm font-black text-red-600">₹{selectedPoint.revenue}</p>
                  </div>
                )}
              </div>

              {/* Dynamic SVG Sparkline Graph */}
              <div className="w-full">
                <svg viewBox={`0 0 500 ${chartHeight}`} className="w-full overflow-visible">
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.00" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const y = paddingY + ratio * (chartHeight - paddingY * 2);
                    return (
                      <line
                        key={i}
                        x1={paddingX}
                        y1={y}
                        x2={500 - paddingX}
                        y2={y}
                        stroke="#e7e5e4"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                    );
                  })}

                  {/* Render Area fill */}
                  <path
                    d={`
                      M ${paddingX} ${chartHeight - paddingY}
                      ${daysData.map((d, i) => {
                        const x = paddingX + (i * (500 - paddingX * 2)) / (daysData.length - 1);
                        const y = chartHeight - paddingY - (d.revenue / maxRevenue) * (chartHeight - paddingY * 2);
                        return `L ${x} ${y}`;
                      }).join(' ')}
                      L ${500 - paddingX} ${chartHeight - paddingY} Z
                    `}
                    fill="url(#gradient)"
                  />

                  {/* Render Line */}
                  <path
                    d={daysData.map((d, i) => {
                      const x = paddingX + (i * (500 - paddingX * 2)) / (daysData.length - 1);
                      const y = chartHeight - paddingY - (d.revenue / maxRevenue) * (chartHeight - paddingY * 2);
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#b91c1c"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Dynamic interactive node overlay dots */}
                  {daysData.map((d, i) => {
                    const x = paddingX + (i * (500 - paddingX * 2)) / (daysData.length - 1);
                    const y = chartHeight - paddingY - (d.revenue / maxRevenue) * (chartHeight - paddingY * 2);
                    const isSelected = selectedPoint?.day === d.day;

                    return (
                      <g key={i} className="cursor-pointer" onClick={() => setSelectedPoint(d)}>
                        {/* Larger transparent hit area for touch targets */}
                        <circle cx={x} cy={y} r="14" fill="transparent" />
                        <circle
                          cx={x}
                          cy={y}
                          r={isSelected ? "6" : "4"}
                          fill={isSelected ? "#b91c1c" : "#ffffff"}
                          stroke="#b91c1c"
                          strokeWidth="2.5"
                          className="transition-all"
                        />
                      </g>
                    );
                  })}

                  {/* X-Axis Labels */}
                  {daysData.map((d, i) => {
                    const x = paddingX + (i * (500 - paddingX * 2)) / (daysData.length - 1);
                    const label = d.day.slice(0, 3);
                    return (
                      <text
                        key={i}
                        x={x}
                        y={chartHeight - 6}
                        textAnchor="middle"
                        className="text-[10px] font-bold text-stone-400 fill-current"
                      >
                        {label}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* Category Sales Distribution */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-3xs space-y-3.5">
            <div>
              <h3 className="font-extrabold text-stone-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-stone-600" /> Revenue Split by Food Category
              </h3>
              <p className="text-[10px] text-stone-400">Strategic classification of income streams</p>
            </div>

            {analytics.topCategorySales && analytics.topCategorySales.length > 0 ? (
              <div className="space-y-3">
                {analytics.topCategorySales.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-stone-700">{cat.category}</span>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="text-stone-900">₹{cat.revenue}</span>
                        <span className="text-stone-400 text-[10px]">({cat.percentage}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-red-700 h-full rounded-full transition-all duration-500"
                        style={{ width: `${cat.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-stone-400 text-xs">
                <p className="font-semibold text-stone-500">No Category Sales Recorded</p>
                <p className="text-[10px] text-stone-400 mt-0.5">Real-time revenue share will chart here once customer orders arrive.</p>
              </div>
            )}
          </div>

          {/* Orders Funnel Matrix */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-3xs space-y-3.5">
            <div>
              <h3 className="font-extrabold text-stone-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-stone-600" /> Live Orders Workflow Funnel
              </h3>
              <p className="text-[10px] text-stone-400">Total volume distribution grouped by preparation stages</p>
            </div>

            {analytics.ordersByStatus && analytics.ordersByStatus.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {analytics.ordersByStatus.map((st) => (
                  <div key={st.status} className="p-3 bg-stone-50 border border-stone-200/60 rounded-xl space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                        {st.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs font-black text-stone-900 bg-white border border-stone-200 px-1.5 py-0.5 rounded-md shadow-3xs">
                        {st.count}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-stone-200 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-stone-700 h-full" 
                          style={{ width: `${st.percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-[9px] font-black text-stone-500">{st.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-stone-400 text-xs">
                <p className="font-semibold text-stone-500">No Active Order Stages</p>
                <p className="text-[10px] text-stone-400 mt-0.5">Workflow stages will track here in real-time as orders progress.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'DISHES' && (
        <div className="space-y-4">
          {/* Dish Sales Breakdown */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-3xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-stone-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-500 fill-amber-500" /> Dish Popularity Dashboard
                </h3>
                <p className="text-[10px] text-stone-500">Performance logs sorted by target parameter</p>
              </div>

              <div className="flex bg-stone-100 p-0.5 rounded-xl border border-stone-200">
                <button
                  onClick={() => setSortKey('UNITS')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${
                    sortKey === 'UNITS' ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500'
                  }`}
                >
                  Units Sold
                </button>
                <button
                  onClick={() => setSortKey('REVENUE')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${
                    sortKey === 'REVENUE' ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500'
                  }`}
                >
                  Revenue
                </button>
              </div>
            </div>

            {sortedItemSales.length > 0 ? (
              <div className="divide-y divide-stone-100">
                {sortedItemSales.map((item, idx) => (
                  <div key={item.menuItemId} className="py-3 flex items-center justify-between text-xs transition-colors hover:bg-stone-50 px-1 rounded-lg">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 font-black text-stone-400 text-xs text-center">#{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="font-black text-stone-900 truncate">{item.name}</p>
                        <p className="text-[10px] text-stone-400 font-medium">{item.categoryName}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-stone-900 text-sm">{item.unitsSold} units</span>
                      <p className="text-[11px] text-emerald-700 font-bold mt-0.5">₹{item.revenue}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-stone-400 text-xs">
                <Utensils className="w-7 h-7 mx-auto mb-2 text-stone-300" />
                <p className="font-semibold text-stone-500">No Dish Orders Recorded</p>
                <p className="text-[10px] text-stone-400 mt-0.5">Dish rankings and sold unit metrics will update live with every placed order.</p>
              </div>
            )}
          </div>

          {/* Peak Hours Chart */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-3xs space-y-3">
            <h3 className="font-extrabold text-stone-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-red-600" /> Hourly Order Load Distribution
            </h3>
            <p className="text-[10px] text-stone-400">Busiest operational intervals of kitchen dispatchers</p>

            <div className="space-y-3 mt-2">
              {(analytics.peakHours || []).map((pk) => (
                <div key={pk.hour} className="text-xs">
                  <div className="flex justify-between font-bold text-stone-700 text-[11px] mb-1">
                    <span>{pk.hour}</span>
                    <span className="font-black text-stone-900">{pk.count} Orders</span>
                  </div>
                  <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-red-700 h-full rounded-full"
                      style={{ width: `${Math.min(100, (pk.count / 40) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'REVIEWS' && (
        <div className="space-y-4">
          {/* Customer Reviews & Ratings Distribution */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-3xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-stone-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-stone-600" /> Customer Satisfaction Index
                </h3>
                <p className="text-[10px] text-stone-400">Total aggregate across all reviews and stars</p>
              </div>
              <div className="text-right">
                <span className="font-black text-stone-900 text-lg">
                  {analytics.avgRating > 0 ? `★ ${analytics.avgRating}` : '—'}
                </span>
                <span className="text-stone-400 text-[10px] block">
                  {analytics.avgRating > 0 ? 'out of 5.0' : 'No ratings yet'}
                </span>
              </div>
            </div>

            {/* Ratings distribution visual charts */}
            <div className="space-y-2 pt-2 border-t border-stone-100">
              {(analytics.ratingDistribution || []).map((dist) => (
                <div key={dist.rating} className="flex items-center gap-2.5 text-xs">
                  <span className="w-12 font-bold text-stone-500 text-right">{dist.rating} Stars</span>
                  <div className="flex-1 bg-stone-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full"
                      style={{ width: `${Math.min(100, (dist.count / ((analytics.recentReviews && analytics.recentReviews.length) || 10)) * 100)}%` }}
                    ></div>
                  </div>
                  <span className="w-8 font-bold text-stone-600 text-right">{dist.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Reviews Feed */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase text-stone-400 tracking-wider">Recent Feedback Logs</h4>
            {analytics.recentReviews && analytics.recentReviews.length > 0 ? (
              analytics.recentReviews.map((rev) => (
                <div key={rev.id} className="p-4 bg-white rounded-2xl border border-stone-200 text-xs space-y-2 shadow-3xs">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-black text-stone-900">{rev.customerName}</span>
                      <span className="text-stone-400 text-[10px] block font-medium">Order #{rev.orderNumber}</span>
                    </div>
                    <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-xl font-black flex items-center gap-0.5">
                      ★ {rev.overallRating}.0
                    </span>
                  </div>
                  {rev.comment ? (
                    <p className="text-stone-600 italic leading-relaxed">"{rev.comment}"</p>
                  ) : (
                    <p className="text-stone-400 italic">No detailed comment provided.</p>
                  )}
                  
                  {rev.itemRatings && rev.itemRatings.length > 0 && (
                    <div className="pt-2 border-t border-stone-100 space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-wider text-stone-400">Dish Feedback:</p>
                      {(rev.itemRatings || []).map((ir, i) => (
                        <div key={i} className="flex justify-between items-center text-[10px] text-stone-500">
                          <span className="truncate max-w-[70%] font-semibold">{ir.menuItemName}</span>
                          <span className="text-amber-600 font-bold">★ {ir.rating}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-8 bg-white rounded-2xl border border-stone-200 text-center text-stone-400 p-6 shadow-3xs">
                <Star className="w-7 h-7 mx-auto mb-2 text-stone-300" />
                <p className="font-semibold text-stone-500 text-xs">No Customer Reviews Yet</p>
                <p className="text-[10px] text-stone-400 mt-0.5">Customer feedback and star ratings will stream here automatically upon review submission.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
