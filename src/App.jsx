import { useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import dagre from '@dagrejs/dagre';
import { UploadCloud, Cpu, FileCode, X, ArrowRightLeft, Code2 } from 'lucide-react';

const getLayoutedElements = (nodes, edges) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 200;
  const nodeHeight = 60;

  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      style: {
        background: '#0f172a',
        color: '#f8fafc',
        border: '1px solid #334155',
        borderRadius: '10px',
        padding: '12px 16px',
        fontSize: '13px',
        fontWeight: '600',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        cursor: 'pointer',
      },
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:5000/api/v1/parser/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        const { nodes: rawNodes, edges: rawEdges } = response.data.data;
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          rawNodes,
          rawEdges
        );
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      }
    } catch (error) {
      console.error('File Upload Error:', error);
      alert('ZIP File එක Upload කිරීමේදී දෝෂයක් සිදු විය.');
    } finally {
      setLoading(false);
    }
  };

  const onNodeClick = (_, node) => {
    setSelectedNode(node);
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Left Sidebar - Upload Controls */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between backdrop-blur-md z-10">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <Cpu className="w-8 h-8 text-indigo-500" />
            <h1 className="text-xl font-bold tracking-wider text-white">ArchitectAI</h1>
          </div>

          <div className="space-y-6">
            <div className="p-4 border-2 border-dashed border-slate-700 hover:border-indigo-500 transition-colors rounded-xl text-center bg-slate-950/40 cursor-pointer relative">
              <input
                type="file"
                accept=".zip"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <UploadCloud className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-300">
                {fileName ? fileName : 'Upload Project ZIP'}
              </p>
              <p className="text-xs text-slate-500 mt-1">.zip files supported</p>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                Analyzing AST Architecture...
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 text-xs text-slate-500 flex justify-between">
          <span>Engine Status: Active</span>
          <span className="text-emerald-400">Port 5000</span>
        </div>
      </aside>

      {/* Main Graph Canvas */}
      <main className="flex-1 relative bg-slate-950 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background color="#334155" gap={16} />
          <Controls className="bg-slate-800 border-slate-700 text-slate-200" />
        </ReactFlow>
      </main>

      {/* Right Drawer - File Details & Code Preview */}
      {selectedNode && (
        <aside className="w-96 border-l border-slate-800 bg-slate-900/95 p-6 flex flex-col justify-between backdrop-blur-md z-20 shadow-2xl transition-all">
          <div className="space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <FileCode className="w-5 h-5" />
                <h2 className="font-semibold text-white truncate max-w-[200px]">
                  {selectedNode.data.label}
                </h2>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Path Details */}
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                File Path
              </span>
              <p className="text-xs font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 break-all">
                {selectedNode.data.path}
              </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                  Imports
                </div>
                <span className="text-lg font-bold text-white">
                  {selectedNode.data.importsCount}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <Code2 className="w-4 h-4 text-emerald-400" />
                  Exports
                </div>
                <span className="text-lg font-bold text-white">
                  {selectedNode.data.exportsList?.length || 0}
                </span>
              </div>
            </div>

            {/* Code Preview */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Code Snippet Preview
              </span>
              <pre className="text-[11px] font-mono bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-60 whitespace-pre-wrap">
                {selectedNode.data.codeSnippet || '// No preview available'}
              </pre>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}