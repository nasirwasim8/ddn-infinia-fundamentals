import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { Play, Activity, Clock, Zap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function Benchmark() {
  const [buckets, setBuckets] = useState<any[]>([])
  const [bucket, setBucket] = useState('')
  const [size, setSize] = useState('1MB')
  const [count, setCount] = useState(10)
  const [concurrency, setConcurrency] = useState(5)
  
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])

  useEffect(() => {
    api.listBuckets().then(res => {
      setBuckets(res.buckets || [])
      if (res.buckets?.length > 0) setBucket(res.buckets[0].Name)
    })
  }, [])

  const runBenchmark = async () => {
    if (!bucket) return
    setRunning(true)
    setProgress(0)
    setResult(null)
    
    // Simulate progress updates since real API might take a while
    const interval = setInterval(() => {
      setProgress(p => (p < 90 ? p + Math.random() * 10 : p))
    }, 500)

    try {
      const res = await api.runBenchmark(bucket, size, count, concurrency)
      setResult(res)
      setHistory(prev => [res, ...prev].slice(0, 5))
      setProgress(100)
    } catch (err: any) {
      toast.error('Benchmark failed: ' + err.message)
      setProgress(0)
    } finally {
      clearInterval(interval)
      setTimeout(() => setRunning(false), 500)
    }
  }

  const chartData = result ? [
    { name: 'Upload (MB/s)', value: result.uploadThroughput },
    { name: 'Download (MB/s)', value: result.downloadThroughput }
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>Performance Benchmark</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Test read/write throughput and latency.</p>
      </div>

      <div style={{ display: 'flex', gap: '24px', background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Target Bucket</label>
          <select value={bucket} onChange={e => setBucket(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}>
            {buckets.map(b => <option key={b.Name} value={b.Name}>{b.Name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Object Size</label>
          <select value={size} onChange={e => setSize(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}>
            <option value="1KB">1 KB</option>
            <option value="64KB">64 KB</option>
            <option value="1MB">1 MB</option>
            <option value="10MB">10 MB</option>
            <option value="100MB">100 MB</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Object Count</label>
          <select value={count} onChange={e => setCount(Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}>
            <option value={10}>10</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Concurrency</label>
          <select value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}>
            <option value={1}>1</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </div>
        <button onClick={runBenchmark} disabled={running} style={{ padding: '10px 24px', background: '#ED2738', border: 'none', borderRadius: '6px', color: 'white', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', opacity: running ? 0.7 : 1 }}>
          <Play size={18} fill="white" /> {running ? 'Running...' : 'Run Test'}
        </button>
      </div>

      {running && (
        <div style={{ height: 4, background: 'var(--surface-card)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: '#ED2738', transition: 'width 0.2s' }} />
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <MetricCard title="Upload Speed" value={`${result.uploadThroughput} MB/s`} icon={<Zap size={20} color="#ED2738" />} />
              <MetricCard title="Download Speed" value={`${result.downloadThroughput} MB/s`} icon={<Zap size={20} color="#00C280" />} />
              <MetricCard title="Avg Latency" value={`${result.avgLatency} ms`} icon={<Clock size={20} color="var(--text-muted)" />} />
              <MetricCard title="P99 Latency" value={`${result.p99Latency} ms`} icon={<Activity size={20} color="var(--text-muted)" />} />
            </div>
            <MetricCard title="Time To First Byte (TTFB)" value={`${result.ttfb} ms`} icon={<Activity size={20} color="var(--text-muted)" />} />
          </div>

          <div style={{ flex: 1, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', height: 300 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Throughput (MB/s)</h3>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip cursor={{fill: 'var(--surface-hover)'}} contentStyle={{background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px'}} />
                <Bar dataKey="value" fill="#ED2738" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ background: 'var(--surface-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Recent Runs</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-hover)', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 24px' }}>Config</th>
                <th style={{ padding: '12px 24px' }}>Upload</th>
                <th style={{ padding: '12px 24px' }}>Download</th>
                <th style={{ padding: '12px 24px' }}>Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)', fontSize: '14px' }}>
                  <td style={{ padding: '16px 24px' }}>{size} × {count} (C: {concurrency})</td>
                  <td style={{ padding: '16px 24px', fontWeight: 600 }}>{h.uploadThroughput} MB/s</td>
                  <td style={{ padding: '16px 24px', fontWeight: 600 }}>{h.downloadThroughput} MB/s</td>
                  <td style={{ padding: '16px 24px' }}>{h.avgLatency} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MetricCard({ title, value, icon }: any) {
  return (
    <div style={{ background: 'var(--surface-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500 }}>{title}</span>
        {icon}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
