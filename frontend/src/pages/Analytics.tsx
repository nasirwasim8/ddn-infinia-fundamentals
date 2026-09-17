import React, { useEffect, useState } from 'react'
import * as api from '../services/api'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Database, Box, HardDrive } from 'lucide-react'

const COLORS = ['#ED2738', '#00C280', '#0070F3', '#F5A623', '#7B61FF', '#E0E0E0']

export default function Analytics() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getAnalytics()
        setData(res)
      } catch (err) {
        console.error(err)
      }
    }
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  if (!data) return <div style={{ color: 'var(--text-muted)' }}>Loading analytics...</div>

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const pieData = data.bucketStats.map((b: any) => ({ name: b.bucket, value: b.totalBytes }))
  const barData = data.bucketStats.map((b: any) => ({ name: b.bucket, count: b.objectCount }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>Analytics</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Cluster-wide storage utilization and object distribution.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <MetricCard title="Total Buckets" value={data.summary.totalBuckets} icon={<Database size={24} color="var(--text-muted)" />} />
        <MetricCard title="Total Objects" value={data.summary.totalObjects} icon={<Box size={24} color="var(--text-muted)" />} />
        <MetricCard title="Total Storage" value={formatSize(data.summary.totalBytes)} icon={<HardDrive size={24} color="var(--text-muted)" />} />
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', height: 350 }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 16px 0' }}>Storage per Bucket</h2>
          <ResponsiveContainer width="100%" height="80%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                {pieData.map((e: any, i: number) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip 
                formatter={(val: number) => formatSize(val)}
                contentStyle={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', height: 350 }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 16px 0' }}>Objects per Bucket</h2>
          <ResponsiveContainer width="100%" height="80%">
            <BarChart data={barData} layout="vertical" margin={{ left: 24 }}>
              <XAxis type="number" stroke="var(--text-muted)" fontSize={12} />
              <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={12} />
              <Tooltip contentStyle={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }} />
              <Bar dataKey="count" fill="#00C280" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: 'var(--surface-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Largest Objects</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Key</th>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Bucket</th>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Size</th>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Last Modified</th>
            </tr>
          </thead>
          <tbody>
            {data.largestObjects.map((o: any, i: number) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)', fontSize: '14px' }}>
                <td style={{ padding: '16px 24px', fontWeight: 500 }}>{o.key}</td>
                <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>{o.bucket}</td>
                <td style={{ padding: '16px 24px', fontWeight: 600 }}>{formatSize(o.size)}</td>
                <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>{new Date(o.lastModified).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricCard({ title, value, icon }: any) {
  return (
    <div style={{ background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500 }}>{title}</span>
        {icon}
      </div>
      <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
