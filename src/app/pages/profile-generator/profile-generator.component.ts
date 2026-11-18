import { Component, HostListener, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../core/services/ai.service';

interface UploadFile {
  file: File;
  name: string;
  size: string;
  status: 'waiting' | 'processing' | 'done' | 'error';
}

interface ProfileResult {
  fileName: string;
  status: 'done' | 'error';
  data?: any;
  error?: string;
}

interface SummaryData {
  total: number;
  success: number;
  failed: number;
  timeTaken: string;
}

@Component({
  selector: 'app-profile-generator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-generator.component.html',
  styleUrls: ['./profile-generator.component.scss']
})
export class ProfileGeneratorComponent implements OnInit {
  @HostListener('window:dragover', ['$event']) onWindowDragOver(e: DragEvent) { e.preventDefault(); }
  @HostListener('window:drop', ['$event']) onWindowDrop(e: DragEvent) { e.preventDefault(); }

  templates: any[] = [];
  selectedTemplateId: number | null = null;
  files: UploadFile[] = [];
  dragOver = false;
  loading = false;
  loadingTemplates = false;
  error = '';

  results: ProfileResult[] = [];
  expandedIndex: number | null = null;

  currentFileIndex = -1;
  processedCount = 0;

  showSummary = false;
  summaryData: SummaryData | null = null;
  private startTime = 0;

  constructor(private aiService: AiService, private ngZone: NgZone) {}

  ngOnInit() {
    this.loadTemplates();
  }

  loadTemplates() {
    this.loadingTemplates = true;
    this.aiService.getTemplates().subscribe({
      next: (res) => {
        this.templates = res.data || [];
        this.loadingTemplates = false;
      },
      error: () => {
        this.error = 'Failed to load templates';
        this.loadingTemplates = false;
      }
    });
  }

  getSelectedTemplateName(): string {
    const t = this.templates.find(t => t.id === this.selectedTemplateId);
    return t ? t.name : '';
  }

  // --- Drag & Drop ---

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;
    if (event.dataTransfer?.files) {
      this.addFiles(event.dataTransfer.files);
    }
  }

  browseFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.png,.jpg,.jpeg,.tiff,.tif,.pdf';
    input.onchange = (e: Event) => {
      this.ngZone.run(() => {
        const el = e.target as HTMLInputElement;
        if (el.files) this.addFiles(el.files);
      });
    };
    input.click();
  }

  private addFiles(fileList: FileList) {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/tiff', 'application/pdf'];
    const allowedExts = ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.pdf'];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      const typeOk = allowedTypes.includes(file.type) || file.type.startsWith('image/');
      const extOk = allowedExts.includes(ext);
      if (!typeOk && !extOk) continue;
      const exists = this.files.some(f => f.name === file.name && f.file.size === file.size);
      if (exists) continue;
      this.files.push({
        file,
        name: file.name,
        size: this.formatSize(file.size),
        status: 'waiting'
      });
    }
    this.error = '';
  }

  removeFile(index: number) {
    this.files.splice(index, 1);
  }

  // --- Submit ---

  canStart(): boolean {
    return this.files.length > 0
      && this.selectedTemplateId !== null
      && this.files.some(f => f.status === 'waiting')
      && !this.loading;
  }

  async submit() {
    if (!this.canStart()) return;

    const templateName = this.getSelectedTemplateName();
    this.loading = true;
    this.error = '';
    this.results = [];
    this.processedCount = 0;
    this.expandedIndex = null;
    this.startTime = Date.now();

    const pending = this.files.filter(f => f.status === 'waiting');

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      this.currentFileIndex = this.files.indexOf(item);
      item.status = 'processing';

      try {
        const res = await this.aiService.generateProfile(
          item.file, this.selectedTemplateId!, templateName
        ).toPromise();
        item.status = 'done';
        this.results.push({
          fileName: item.name,
          status: 'done',
          data: res.data
        });
      } catch (err: any) {
        item.status = 'error';
        this.results.push({
          fileName: item.name,
          status: 'error',
          error: err.error?.message || 'Failed to generate profile'
        });
      }

      this.processedCount++;
    }

    this.loading = false;
    this.currentFileIndex = -1;
    this.showPipelineSummary();

    if (this.results.length === 1 && this.results[0].status === 'done') {
      this.expandedIndex = 0;
    }
  }

  private showPipelineSummary() {
    const elapsed = Date.now() - this.startTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const timeTaken = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    this.summaryData = {
      total: this.files.length,
      success: this.results.filter(r => r.status === 'done').length,
      failed: this.results.filter(r => r.status === 'error').length,
      timeTaken
    };
    this.showSummary = true;
  }

  closeSummary() {
    this.showSummary = false;
  }

  reset() {
    this.selectedTemplateId = null;
    this.files = [];
    this.results = [];
    this.error = '';
    this.processedCount = 0;
    this.currentFileIndex = -1;
    this.expandedIndex = null;
    this.showSummary = false;
    this.summaryData = null;
  }

  // --- UI Helpers ---

  toggleExpand(index: number) {
    this.expandedIndex = this.expandedIndex === index ? null : index;
  }

  getOverallProgress(): number {
    if (this.files.length === 0) return 0;
    return Math.round((this.processedCount / this.files.length) * 100);
  }

  getFileIcon(name: string): string {
    if (name.toLowerCase().endsWith('.pdf')) return 'fa-file-pdf';
    return 'fa-file-image';
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
}
