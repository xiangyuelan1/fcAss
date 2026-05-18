import React, { useEffect, useState } from 'react'
import {
  Card,
  Button,
  Space,
  message,
  Modal,
  Input,
  Tag,
  Row,
  Col,
  List,
  Popconfirm,
  Empty,
  Spin,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  StarOutlined,
  ArrowLeftOutlined,
  CloudSyncOutlined,
} from '@ant-design/icons'
import { watchlistApi, dataApi } from '@/services/api'

const WatchlistPage: React.FC = () => {
  const [watchlists, setWatchlists] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // 创建自选表
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')

  // 编辑自选表
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  // 自选表详情
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detailName, setDetailName] = useState('')
  const [detailStocks, setDetailStocks] = useState<any[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // 搜索添加股票
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    fetchWatchlists()
  }, [])

  const fetchWatchlists = async () => {
    setLoading(true)
    try {
      const data: any = await watchlistApi.getWatchlists()
      setWatchlists(data)
    } catch {
      message.error('获取自选表列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!createName.trim()) {
      message.error('请输入自选表名称')
      return
    }
    try {
      await watchlistApi.createWatchlist({
        name: createName.trim(),
        description: createDesc.trim() || undefined,
      })
      message.success('自选表创建成功')
      setCreateModalVisible(false)
      setCreateName('')
      setCreateDesc('')
      fetchWatchlists()
    } catch {
      message.error('创建失败')
    }
  }

  const handleUpdate = async () => {
    if (!editId || !editName.trim()) return
    try {
      await watchlistApi.updateWatchlist(editId, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      })
      message.success('更新成功')
      setEditModalVisible(false)
      fetchWatchlists()
      if (detailId === editId) setDetailName(editName.trim())
    } catch {
      message.error('更新失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await watchlistApi.deleteWatchlist(id)
      message.success('已删除')
      if (detailId === id) {
        setDetailId(null)
        setDetailStocks([])
      }
      fetchWatchlists()
    } catch {
      message.error('删除失败')
    }
  }

  const handleViewDetail = async (wl: any) => {
    setDetailId(wl.id)
    setDetailName(wl.name)
    setDetailLoading(true)
    try {
      const data: any = await watchlistApi.getStocks(wl.id)
      setDetailStocks(data)
    } catch {
      message.error('获取股票列表失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleRemoveStock = async (stockCode: string) => {
    if (!detailId) return
    try {
      await watchlistApi.removeStock(detailId, stockCode)
      message.success('已移除')
      const data: any = await watchlistApi.getStocks(detailId)
      setDetailStocks(data)
      fetchWatchlists()
    } catch {
      message.error('移除失败')
    }
  }

  const handleSearch = async (keyword: string) => {
    setSearchKeyword(keyword)
    if (!keyword.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const data: any = await dataApi.searchStockPool(keyword.trim())
      setSearchResults(data)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleAddStock = async (code: string, name: string) => {
    if (!detailId) return
    try {
      await watchlistApi.addStock(detailId, { stock_code: code, stock_name: name })
      message.success(`已添加 ${name}`)
      const data: any = await watchlistApi.getStocks(detailId)
      setDetailStocks(data)
      fetchWatchlists()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (detail) message.warning(detail)
      else message.error('添加失败')
    }
  }

  const handleSyncPool = async () => {
    setSyncing(true)
    try {
      const res: any = await dataApi.syncStockPool()
      message.success(res.message || '同步完成')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(detail || '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  // 详情视图
  if (detailId) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Button
              type="link"
              icon={<ArrowLeftOutlined />}
              onClick={() => { setDetailId(null); setDetailStocks([]); setSearchKeyword(''); setSearchResults([]) }}
              style={{ padding: 0, marginRight: 12 }}
            >
              返回列表
            </Button>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{detailName}</span>
          </div>
          <Space>
            <Button
              icon={<EditOutlined />}
              onClick={() => {
                const wl = watchlists.find((w) => w.id === detailId)
                if (wl) {
                  setEditId(wl.id)
                  setEditName(wl.name)
                  setEditDesc(wl.description || '')
                  setEditModalVisible(true)
                }
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title="确定删除此自选表？删除后不可恢复"
              onConfirm={() => handleDelete(detailId)}
            >
              <Button danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </Space>
        </div>

        {/* 搜索添加股票 */}
        <Card size="small" title="搜索添加股票" style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder="输入股票代码或名称搜索"
            value={searchKeyword}
            onChange={(e) => handleSearch(e.target.value)}
            onSearch={handleSearch}
            loading={searching}
            allowClear
            enterButton
          />
          {searchResults.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 12, border: '1px solid #f0f0f0', borderRadius: 8 }}>
              {searchResults.map((stock: any) => {
                const alreadyAdded = detailStocks.some((s: any) => s.stock_code === stock.code)
                return (
                  <div
                    key={stock.code}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: alreadyAdded ? '#f6ffed' : 'transparent',
                      borderBottom: '1px solid #f5f5f5',
                    }}
                  >
                    <span>
                      <strong>{stock.code}</strong> - {stock.name}
                      {stock.exchange && <Tag color="blue" style={{ marginLeft: 8 }}>{stock.exchange}</Tag>}
                    </span>
                    {alreadyAdded ? (
                      <Tag color="green">已添加</Tag>
                    ) : (
                      <Button size="small" type="link" onClick={() => handleAddStock(stock.code, stock.name)}>
                        添加
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* 股票列表 */}
        <Card size="small" title={`股票列表 (${detailStocks.length})`}>
          <Spin spinning={detailLoading}>
            {detailStocks.length === 0 ? (
              <Empty description="暂无股票，请通过搜索添加" />
            ) : (
              <List
                size="small"
                dataSource={detailStocks}
                renderItem={(item: any) => (
                  <List.Item
                    actions={[
                      <Popconfirm
                        title="确定移除此股票？"
                        onConfirm={() => handleRemoveStock(item.stock_code)}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />}>
                          移除
                        </Button>
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <span>
                          <strong>{item.stock_code}</strong> - {item.stock_name}
                        </span>
                      }
                      description={`添加时间: ${item.added_at || '未知'}`}
                    />
                  </List.Item>
                )}
              />
            )}
          </Spin>
        </Card>

        {/* 编辑弹窗 */}
        <Modal
          title="编辑自选表"
          open={editModalVisible}
          onOk={handleUpdate}
          onCancel={() => setEditModalVisible(false)}
          okText="保存"
        >
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>名称</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>描述</label>
            <Input.TextArea rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </div>
        </Modal>
      </div>
    )
  }

  // 列表视图
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>自选股管理</h1>
          <p className="page-description" style={{ marginBottom: 0 }}>
            创建自选表，管理你关注的股票组合，训练模型时可快速选择
          </p>
        </div>
        <Space>
          <Tooltip title="从akshare同步A股股票池（代码和名称），用于搜索添加股票">
            <Button
              icon={<CloudSyncOutlined />}
              onClick={handleSyncPool}
              loading={syncing}
            >
              同步A股股票池
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            创建自选表
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        {watchlists.length === 0 ? (
          <Card>
            <Empty
              description="暂无自选表"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                创建第一个自选表
              </Button>
            </Empty>
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {watchlists.map((wl: any) => (
              <Col xs={24} sm={12} lg={8} xl={6} key={wl.id}>
                <Card
                  hoverable
                  size="small"
                  onClick={() => handleViewDetail(wl)}
                  style={{ height: '100%' }}
                  styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>
                        <FolderOutlined style={{ marginRight: 8, color: '#faad14' }} />
                        {wl.name}
                      </span>
                      <Popconfirm
                        title="确定删除？"
                        onConfirm={(e) => { e?.stopPropagation(); handleDelete(wl.id) }}
                        onCancel={(e) => e?.stopPropagation()}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>
                    </div>
                    <div style={{ color: '#999', fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                      {wl.description || '暂无描述'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                    <Tag color="blue" icon={<StarOutlined />}>
                      {wl.stock_count} 只股票
                    </Tag>
                    <span style={{ fontSize: 11, color: '#bbb' }}>
                      {wl.updated_at?.split(' ')[0] || ''}
                    </span>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      {/* 创建弹窗 */}
      <Modal
        title="创建自选表"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => { setCreateModalVisible(false); setCreateName(''); setCreateDesc('') }}
        okText="创建"
      >
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            名称 <span style={{ color: '#f5222d' }}>*</span>
          </label>
          <Input
            placeholder="例如：白酒龙头、科技成长"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            maxLength={100}
            showCount
          />
        </div>
        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>描述</label>
          <Input.TextArea
            placeholder="描述这个自选表的用途（可选）"
            rows={3}
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            maxLength={500}
            showCount
          />
        </div>
      </Modal>
    </div>
  )
}

export default WatchlistPage
