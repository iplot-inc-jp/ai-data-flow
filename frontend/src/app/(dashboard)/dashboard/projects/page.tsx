'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Folder, Plus, Building2, Loader2, ArrowRight } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

type Organization = {
  id: string;
  name: string;
  slug: string;
  description?: string;
};

type Project = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  organizationId: string;
};

export default function ProjectsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', slug: '', description: '' });

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchOrganizations = useCallback(async () => {
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/organizations`, { headers });
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data);
        if (data.length > 0) {
          setSelectedOrg(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    }
  }, [getHeaders]);

  const fetchProjects = useCallback(async (orgId: string) => {
    setLoading(true);
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/organizations/${orgId}/projects`, { headers });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  useEffect(() => {
    if (selectedOrg) {
      fetchProjects(selectedOrg.id);
    }
  }, [selectedOrg, fetchProjects]);

  const handleSelectProject = (project: Project) => {
    localStorage.setItem('selectedProjectId', project.id);
    localStorage.setItem('selectedProjectName', project.name);
    router.push(`/dashboard/projects/${project.id}`);
  };

  const handleCreateProject = async () => {
    if (!newProject.name || !newProject.slug || !selectedOrg) return;

    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/organizations/${selectedOrg.id}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newProject),
      });
      if (res.ok) {
        await fetchProjects(selectedOrg.id);
        setIsCreateDialogOpen(false);
        setNewProject({ name: '', slug: '', description: '' });
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  if (loading && organizations.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">プロジェクト選択</h1>
          <p className="text-gray-500 mt-1">作業するプロジェクトを選択してください</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              新規プロジェクト
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle className="text-gray-900">新規プロジェクト作成</DialogTitle>
              <DialogDescription className="text-gray-500">
                新しいプロジェクトを作成します
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-gray-700">プロジェクト名</Label>
                <Input
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="ECサイト"
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700">スラッグ</Label>
                <Input
                  value={newProject.slug}
                  onChange={(e) => setNewProject({ ...newProject, slug: e.target.value })}
                  placeholder="ec-site"
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700">説明</Label>
                <Input
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="プロジェクトの説明"
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="border-gray-300 text-gray-700">
                キャンセル
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCreateProject}>
                作成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Organization Selector */}
      {organizations.length > 1 && (
        <div className="flex items-center gap-4">
          <Building2 className="w-5 h-5 text-gray-500" />
          <Select
            value={selectedOrg?.id}
            onValueChange={(id) => {
              const org = organizations.find((o) => o.id === id);
              if (org) setSelectedOrg(org);
            }}
          >
            <SelectTrigger className="w-[300px] bg-white border-gray-300">
              <SelectValue placeholder="組織を選択" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200">
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id} className="text-gray-700">
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="bg-white border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => handleSelectProject(project)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <Folder className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                        {project.name}
                      </CardTitle>
                      <code className="text-xs text-gray-500">{project.slug}</code>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {project.description || 'プロジェクトの説明がありません'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-white border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Folder className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-2">プロジェクトがありません</p>
            <p className="text-sm text-gray-400 mb-4">新しいプロジェクトを作成してください</p>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              プロジェクト作成
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
