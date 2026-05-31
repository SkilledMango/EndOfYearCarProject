import { useEffect, useState } from 'react';
import { getStats } from '../Services/api';
import {
    Box, Card, CardContent, CircularProgress,
    Grid, Typography, Chip, Divider, Stack, Avatar, Tooltip,
} from '@mui/material';
import PeopleIcon        from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import WarningAmberIcon  from '@mui/icons-material/WarningAmber';
import AccessTimeIcon    from '@mui/icons-material/AccessTime';
import CodeIcon          from '@mui/icons-material/Code';

// ─── Constants ────────────────────────────────────────────────────────────────
const SEVERITY_COLOR = { 1: '#22C55E', 2: '#F59E0B', 3: '#EF4444' };
const SEVERITY_LABEL = { 1: 'Green',   2: 'Yellow',  3: 'Red'    };
const SEVERITY_BG    = { 1: '#F0FDF4', 2: '#FFFBEB',  3: '#FEF2F2' };

const severityChipSx = (s) => ({
    fontWeight: 700,
    fontSize: 11,
    height: 22,
    backgroundColor: SEVERITY_BG[s] ?? '#F3F4F6',
    color: SEVERITY_COLOR[s] ?? '#6B7280',
    border: `1px solid ${SEVERITY_COLOR[s] ?? '#6B7280'}40`,
});

const formatTime = (d) => new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});
const formatDay = (d) => {
    const date = new Date(d);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, gradient, iconColor }) {
    return (
        <Card elevation={0} sx={{
            borderRadius: 3,
            background: gradient,
            border: '1px solid rgba(255,255,255,0.6)',
            height: '100%',
        }}>
            <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography variant="body2" sx={{ color: 'rgba(0,0,0,0.5)', fontWeight: 500, mb: 0.5, fontSize: 13 }}>
                            {label}
                        </Typography>
                        <Typography variant="h3" fontWeight={800} sx={{ color: '#1a1a2e', lineHeight: 1 }}>
                            {value ?? '—'}
                        </Typography>
                    </Box>
                    <Avatar sx={{
                        width: 48, height: 48,
                        backgroundColor: 'rgba(255,255,255,0.7)',
                        color: iconColor,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    }}>
                        {icon}
                    </Avatar>
                </Box>
            </CardContent>
        </Card>
    );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ data, color = '#6366F1' }) {
    const [hovered, setHovered] = useState(null);

    if (!data || data.length === 0) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180 }}>
                <Typography color="text.secondary" variant="body2">No data yet</Typography>
            </Box>
        );
    }

    const max = Math.max(...data.map(d => d.value), 1);

    return (
        <Box sx={{ position: 'relative' }}>
            {/* Grid lines */}
            <Box sx={{ position: 'relative', height: 180, pt: 1 }}>
                {[0.25, 0.5, 0.75, 1].map(pct => (
                    <Box key={pct} sx={{
                        position: 'absolute',
                        left: 0, right: 0,
                        bottom: `${pct * 130 + 24}px`,
                        borderTop: '1px dashed #E5E7EB',
                    }} />
                ))}

                {/* Bars */}
                <Box sx={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '4px',
                    height: '100%',
                    px: 0.5,
                }}>
                    {data.map((d, i) => {
                        const barH = Math.max((d.value / max) * 130, d.value > 0 ? 6 : 0);
                        const isHov = hovered === i;
                        return (
                            <Tooltip
                                key={i}
                                title={`${d.label}: ${d.value} fault${d.value !== 1 ? 's' : ''}`}
                                arrow
                                placement="top"
                            >
                                <Box
                                    onMouseEnter={() => setHovered(i)}
                                    onMouseLeave={() => setHovered(null)}
                                    sx={{
                                        flex: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '4px',
                                        cursor: 'default',
                                        pb: '24px',
                                    }}
                                >
                                    {/* Value label */}
                                    <Typography variant="caption" sx={{
                                        fontSize: 10, fontWeight: 700,
                                        color: isHov ? color : 'transparent',
                                        transition: 'color 0.15s',
                                        userSelect: 'none',
                                    }}>
                                        {d.value > 0 ? d.value : ''}
                                    </Typography>
                                    {/* Bar */}
                                    <Box sx={{
                                        width: '100%',
                                        height: `${barH}px`,
                                        backgroundColor: isHov ? color : color + 'BB',
                                        borderRadius: '4px 4px 0 0',
                                        transition: 'all 0.2s ease',
                                        transform: isHov ? 'scaleX(1.05)' : 'scaleX(1)',
                                        boxShadow: isHov ? `0 4px 12px ${color}60` : 'none',
                                    }} />
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Box>

                {/* X-axis labels */}
                <Box sx={{
                    display: 'flex',
                    gap: '4px',
                    px: 0.5,
                    mt: '-20px',
                }}>
                    {data.map((d, i) => (
                        <Box key={i} sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                            <Typography variant="caption" sx={{ fontSize: 9, color: '#9CA3AF', textAlign: 'center' }}>
                                {/* Show every other label to avoid clutter */}
                                {i % 2 === 0 ? d.label : ''}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}

// ─── Severity Breakdown ────────────────────────────────────────────────────────
function SeverityBreakdown({ data }) {
    const total = data.reduce((s, d) => s + d.count, 0);

    if (total === 0) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
                <Typography color="text.secondary" variant="body2">No data yet</Typography>
            </Box>
        );
    }

    // Stacked bar at top
    return (
        <Box>
            {/* Stacked bar */}
            <Box sx={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', mb: 3, gap: '2px' }}>
                {data.filter(d => d.count > 0).map((d, i) => (
                    <Tooltip key={i} title={`${SEVERITY_LABEL[d.severity]}: ${d.count} (${Math.round((d.count / total) * 100)}%)`} arrow>
                        <Box sx={{
                            flex: d.count,
                            backgroundColor: SEVERITY_COLOR[d.severity] ?? '#6B7280',
                            transition: 'flex 0.5s ease',
                            cursor: 'default',
                            '&:first-of-type': { borderRadius: '6px 0 0 6px' },
                            '&:last-of-type': { borderRadius: '0 6px 6px 0' },
                        }} />
                    </Tooltip>
                ))}
            </Box>

            {/* Legend rows */}
            <Stack spacing={1.5}>
                {data.map((d, i) => {
                    const pct = Math.round((d.count / total) * 100);
                    return (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{
                                width: 10, height: 10, borderRadius: '50%',
                                backgroundColor: SEVERITY_COLOR[d.severity] ?? '#6B7280',
                                flexShrink: 0,
                            }} />
                            <Typography variant="body2" fontWeight={600} sx={{ flex: 1, color: '#374151' }}>
                                {SEVERITY_LABEL[d.severity] ?? 'Unknown'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" fontWeight={700} color="text.primary">
                                    {d.count}
                                </Typography>
                                <Typography variant="caption" sx={{
                                    backgroundColor: '#F3F4F6',
                                    color: '#6B7280',
                                    px: 0.75, py: 0.25,
                                    borderRadius: 1,
                                    fontWeight: 600,
                                    fontSize: 11,
                                }}>
                                    {pct}%
                                </Typography>
                            </Box>
                        </Box>
                    );
                })}
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Total faults</Typography>
                <Typography variant="caption" fontWeight={700}>{total}</Typography>
            </Box>
        </Box>
    );
}

// ─── Section header ────────────────────────────────────────────────────────────
function SectionTitle({ icon, children }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ color: '#6B7280', display: 'flex' }}>{icon}</Box>
            <Typography variant="subtitle1" fontWeight={700} color="#1F2937">
                {children}
            </Typography>
        </Box>
    );
}

// ─── Main Analytics ────────────────────────────────────────────────────────────
export default function Analytics() {
    const [stats, setStats]     = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getStats().then(data => { setStats(data); setLoading(false); });
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                <CircularProgress size={40} thickness={4} />
            </Box>
        );
    }

    if (!stats) {
        return (
            <Box sx={{ mt: 4, p: 3, bgcolor: '#FEF2F2', borderRadius: 2, border: '1px solid #FECACA' }}>
                <Typography color="error" fontWeight={600}>Could not load analytics data.</Typography>
            </Box>
        );
    }

    const barData = (stats.faultsByDay || []).map(d => ({
        label: formatDay(d.date),
        value: d.count,
    }));

    return (
        <Box sx={{ mt: 2, pb: 6 }}>
            {/* Page header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h5" fontWeight={800} color="#111827" gutterBottom>
                    Analytics Overview
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Live stats from your CarStats platform
                </Typography>
            </Box>

            {/* ── Stat cards ── */}
            <Grid container spacing={2.5} sx={{ mb: 3.5 }}>
                <Grid item xs={12} sm={4}>
                    <StatCard
                        icon={<PeopleIcon fontSize="small" />}
                        label="Total Users"
                        value={stats.totalUsers}
                        gradient="linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)"
                        iconColor="#3B82F6"
                    />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <StatCard
                        icon={<DirectionsCarIcon fontSize="small" />}
                        label="Total Vehicles"
                        value={stats.totalVehicles}
                        gradient="linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)"
                        iconColor="#7C3AED"
                    />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <StatCard
                        icon={<WarningAmberIcon fontSize="small" />}
                        label="Total Faults Logged"
                        value={stats.totalFaults}
                        gradient="linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)"
                        iconColor="#D97706"
                    />
                </Grid>
            </Grid>

            {/* ── Charts row ── */}
            <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                {/* Bar chart */}
                <Grid item xs={12} md={8}>
                    <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #F3F4F6', height: '100%' }}>
                        <CardContent sx={{ p: 3 }}>
                            <SectionTitle icon={<WarningAmberIcon sx={{ fontSize: 18 }} />}>
                                Faults Logged — Last 14 Days
                            </SectionTitle>
                            <BarChart data={barData} color="#6366F1" />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Severity breakdown */}
                <Grid item xs={12} md={4}>
                    <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #F3F4F6', height: '100%' }}>
                        <CardContent sx={{ p: 3 }}>
                            <SectionTitle icon={<WarningAmberIcon sx={{ fontSize: 18 }} />}>
                                Severity Breakdown
                            </SectionTitle>
                            <SeverityBreakdown data={stats.severityBreakdown || []} />
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* ── Bottom row ── */}
            <Grid container spacing={2.5}>
                {/* Top fault codes */}
                <Grid item xs={12} md={5}>
                    <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #F3F4F6' }}>
                        <CardContent sx={{ p: 3 }}>
                            <SectionTitle icon={<CodeIcon sx={{ fontSize: 18 }} />}>
                                Most Common Fault Codes
                            </SectionTitle>
                            {(stats.topCodes || []).length === 0 ? (
                                <Typography color="text.secondary" variant="body2">No faults logged yet.</Typography>
                            ) : stats.topCodes.map((tc, i) => (
                                <Box key={i}>
                                    <Box sx={{
                                        display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', py: 1.5,
                                    }}>
                                        {/* Rank badge */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Box sx={{
                                                width: 28, height: 28, borderRadius: '50%',
                                                backgroundColor: i === 0 ? '#FEF3C7' : i === 1 ? '#F3F4F6' : '#F9FAFB',
                                                color: i === 0 ? '#92400E' : '#6B7280',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 12, fontWeight: 800, flexShrink: 0,
                                            }}>
                                                {i + 1}
                                            </Box>
                                            <Box>
                                                <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace', letterSpacing: 0.5 }}>
                                                    {tc.code}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2, display: 'block' }}>
                                                    {tc.title}
                                                </Typography>
                                            </Box>
                                        </Box>

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                                            {tc.severity && (
                                                <Chip
                                                    label={SEVERITY_LABEL[tc.severity]}
                                                    size="small"
                                                    sx={severityChipSx(tc.severity)}
                                                />
                                            )}
                                            <Box sx={{
                                                px: 1, py: 0.25,
                                                backgroundColor: '#EEF2FF',
                                                borderRadius: 1.5,
                                                minWidth: 36,
                                                textAlign: 'center',
                                            }}>
                                                <Typography variant="caption" fontWeight={800} color="#4338CA">
                                                    ×{tc.count}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                    {i < stats.topCodes.length - 1 && <Divider />}
                                </Box>
                            ))}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Recent events */}
                <Grid item xs={12} md={7}>
                    <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #F3F4F6' }}>
                        <CardContent sx={{ p: 3 }}>
                            <SectionTitle icon={<AccessTimeIcon sx={{ fontSize: 18 }} />}>
                                Recent Fault Events
                            </SectionTitle>
                            {(stats.recentEvents || []).length === 0 ? (
                                <Typography color="text.secondary" variant="body2">No events yet.</Typography>
                            ) : stats.recentEvents.map((ev, i) => (
                                <Box key={ev.id}>
                                    <Box sx={{
                                        display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', py: 1.5, gap: 2,
                                    }}>
                                        {/* Dot + code */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                                            <Box sx={{
                                                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                backgroundColor: SEVERITY_COLOR[ev.severity] ?? '#9CA3AF',
                                                boxShadow: `0 0 0 3px ${(SEVERITY_COLOR[ev.severity] ?? '#9CA3AF')}25`,
                                            }} />
                                            <Box sx={{ minWidth: 0 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                    <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                                                        {ev.rawErrorCode}
                                                    </Typography>
                                                    {ev.severity && (
                                                        <Chip
                                                            label={SEVERITY_LABEL[ev.severity]}
                                                            size="small"
                                                            sx={severityChipSx(ev.severity)}
                                                        />
                                                    )}
                                                </Box>
                                                <Typography variant="caption" color="text.secondary" noWrap>
                                                    {ev.title}
                                                </Typography>
                                            </Box>
                                        </Box>

                                        {/* User + time */}
                                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                                            <Typography variant="caption" fontWeight={600} color="#374151" display="block">
                                                {ev.userName}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {formatTime(ev.timestamp)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    {i < stats.recentEvents.length - 1 && <Divider />}
                                </Box>
                            ))}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
