import { Component, HostListener, NgZone, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AiService } from '../../core/services/ai.service';
import { ReviewQueueService } from '../../core/services/review-queue.service';

type StepStatus = 'idle' | 'processing' | 'done' | 'error' | 'skipped';

interface UploadFile {
  file: File;
  name: string;
  size: string;
  pipelineStatus: 'waiting' | 'classifying' | 'extracting' | 'saving' | 'done' | 'error' | 'needs_review';
  classifyStatus: StepStatus;
  classifyResult?: any;
  classifyError?: string;
  extractStatus: StepStatus;
  extractResult?: any;
  extractError?: string;
  saveStatus: StepStatus;
  saveError?: string;
  savedFileId?: number;
  selectedTemplateId?: number;
  selectedTemplateName?: string;
  confidence: number;
  processedAt?: Date;
}

interface SummaryData {
  total: number;
  success: number;
  needsReview: number;
  failed: number;
  timeTaken: string;
}

@Component({
  selector: 'app-classify',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './classify.component.html',
  styleUrls: ['./classify.component.scss']
})
export class ClassifyComponent implements OnInit {
  @HostListener('window:dragover', ['$event']) onWindowDragOver(e: DragEvent) { e.preventDefault(); }
  @HostListener('window:drop', ['$event']) onWindowDrop(e: DragEvent) { e.preventDefault(); }

  Math = Math;
  mode: 'auto' | 'manual' = 'auto';

  profiles: any[] = [];
  loadingProfiles = false;

  // Auto mode: multi-select templates
  selectedTemplateIds: number[] = [];
  templateSearchText = '';

  // Manual mode: single select
  selectedTemplateId: number | null = null;

  files: UploadFile[] = [];
  dragOver = false;
  error = '';

  processing = false;
  currentFileIndex = -1;
  currentStep = '';
  processedCount = 0;

  extracting = false;
  extractedCount = 0;

  saving = false;

  showSummary = false;
  summary: SummaryData | null = null;
  private pipelineStartTime = 0;

  expandedIndex: number | null = null;
  showDetailModal = false;
  detailModalFile: UploadFile | null = null;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  constructor(
    private aiService: AiService,
    private ngZone: NgZone,
    private router: Router,
    private reviewQueue: ReviewQueueService
  ) {}

  ngOnInit() {
    this.loadProfiles();
  }

  loadProfiles() {
    this.loadingProfiles = true;
    this.aiService.getProfiles().subscribe({
      next: (res) => {
        this.profiles = res.data || [];
        this.loadingProfiles = false;
      },
      error: () => {
        this.profiles = [];
        this.loadingProfiles = false;
      }
    });
  }

  onModeChange() {
    this.error = '';
    this.templateSearchText = '';
  }

  // --- Template Multi-Select (Auto Mode) ---

  get filteredProfiles(): any[] {
    if (!this.templateSearchText.trim()) return this.profiles;
    const q = this.templateSearchText.toLowerCase();
    return this.profiles.filter((p: any) =>
      p.templateName.toLowerCase().includes(q)
    );
  }

  isTemplateSelected(templateId: number): boolean {
    return this.selectedTemplateIds.includes(templateId);
  }

  toggleTemplate(templateId: number) {
    const idx = this.selectedTemplateIds.indexOf(templateId);
    if (idx >= 0) {
      this.selectedTemplateIds.splice(idx, 1);
    } else {
      this.selectedTemplateIds.push(templateId);
    }
  }

  removeTemplate(templateId: number) {
    const idx = this.selectedTemplateIds.indexOf(templateId);
    if (idx >= 0) this.selectedTemplateIds.splice(idx, 1);
  }

  getTemplateName(templateId: number): string {
    const p = this.profiles.find((pr: any) => pr.templateId === templateId);
    return p ? p.templateName : 'Unknown';
  }

  selectAllTemplates() {
    this.selectedTemplateIds = this.profiles.map((p: any) => p.templateId);
  }

  clearTemplateSelection() {
    this.selectedTemplateIds = [];
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

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(input.files);
      input.value = '';
    }
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
        pipelineStatus: 'waiting',
        classifyStatus: 'idle',
        extractStatus: 'idle',
        saveStatus: 'idle',
        confidence: 0
      });
    }
    this.error = '';
  }

  removeFile(index: number) {
    this.files.splice(index, 1);
  }

  clearAll() {
    this.files = [];
    this.processedCount = 0;
    this.extractedCount = 0;
    this.currentFileIndex = -1;
    this.currentStep = '';
    this.expandedIndex = null;
    this.error = '';
    this.showSummary = false;
    this.summary = null;
  }

  // --- Auto Mode: Start Pipeline ---

  canStart(): boolean {
    return this.files.length > 0
      && this.files.some(f => f.pipelineStatus === 'waiting')
      && !this.processing;
  }

  async startPipeline() {
    if (!this.canStart()) return;
    this.processing = true;
    this.processedCount = 0;
    this.error = '';
    this.pipelineStartTime = Date.now();

    const pending = this.files.filter(f => f.pipelineStatus === 'waiting');
    const templateIds = undefined;

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      this.currentFileIndex = this.files.indexOf(item);

      // Step 1: Classify
      this.currentStep = 'Classifying';
      item.pipelineStatus = 'classifying';
      item.classifyStatus = 'processing';

      try {
        const res = await this.aiService.classifyDocument(item.file, templateIds).toPromise();
        item.classifyResult = res.data;
        item.classifyStatus = 'done';
        item.confidence = res.data.confidence || 0;

        if (res.data.status === 'NO_MATCH') {
          item.selectedTemplateId = undefined;
          item.selectedTemplateName = undefined;
          item.pipelineStatus = 'needs_review';
          item.extractStatus = 'skipped';
          item.saveStatus = 'skipped';
          item.processedAt = new Date();
          this.processedCount++;
          continue;
        }

        item.selectedTemplateId = res.data.matchedTemplateId;
        item.selectedTemplateName = res.data.matchedTemplateName;

        if (item.confidence < 0.70) {
          item.pipelineStatus = 'needs_review';
          item.extractStatus = 'skipped';
          item.saveStatus = 'skipped';
          item.processedAt = new Date();
          this.processedCount++;
          continue;
        }
      } catch (err: any) {
        item.classifyError = err.error?.message || 'Classification failed';
        item.classifyStatus = 'error';
        item.pipelineStatus = 'error';
        item.processedAt = new Date();
        this.processedCount++;
        continue;
      }

      // Step 2: Extract
      this.currentStep = 'Extracting';
      item.pipelineStatus = 'extracting';
      item.extractStatus = 'processing';

      try {
        const res = await this.aiService.extractFields(
          item.file, item.selectedTemplateId!, item.selectedTemplateName!
        ).toPromise();
        item.extractResult = res.data;
        item.extractStatus = 'done';
      } catch (err: any) {
        item.extractError = err.error?.message || 'Extraction failed';
        item.extractStatus = 'error';
        item.pipelineStatus = 'error';
        item.processedAt = new Date();
        this.processedCount++;
        continue;
      }

      // Step 3: Save
      this.currentStep = 'Saving';
      item.pipelineStatus = 'saving';
      item.saveStatus = 'processing';

      try {
        const res = await this.aiService.saveDocument(
          item.file, item.selectedTemplateId!, item.selectedTemplateName!,
          item.extractResult.extractedFields
        ).toPromise();
        item.saveStatus = 'done';
        item.savedFileId = res?.data?.fileId;
        item.pipelineStatus = 'done';
      } catch (err: any) {
        item.saveError = err.error?.message || 'Failed to save';
        item.saveStatus = 'error';
        item.pipelineStatus = 'error';
      }

      item.processedAt = new Date();
      this.processedCount++;
    }

    this.processing = false;
    this.currentFileIndex = -1;
    this.currentStep = '';
    this.showPipelineSummary();
  }

  private showPipelineSummary() {
    const elapsed = Date.now() - this.pipelineStartTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const timeTaken = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    this.summary = {
      total: this.files.length,
      success: this.files.filter(f => f.pipelineStatus === 'done').length,
      needsReview: this.files.filter(f => f.pipelineStatus === 'needs_review').length,
      failed: this.files.filter(f => f.pipelineStatus === 'error').length,
      timeTaken
    };
    this.showSummary = true;

    // Push needs_review and failed files to review queue
    const reviewFiles = this.files.filter(f => f.pipelineStatus === 'needs_review' || f.pipelineStatus === 'error');
    if (reviewFiles.length > 0) {
      this.reviewQueue.addMany(reviewFiles.map(f => ({
        file: f.file,
        name: f.name,
        size: f.size,
        confidence: f.confidence,
        selectedTemplateId: f.selectedTemplateId,
        selectedTemplateName: f.selectedTemplateName,
        classifyResult: f.classifyResult,
        classifyError: f.classifyError,
        status: 'pending' as const
      })));
    }
  }

  closeSummary() {
    this.showSummary = false;
  }

  goToReview() {
    this.router.navigate(['/review']);
  }

  // --- Manual Mode: Extract ---

  getSelectedProfile(): any {
    return this.profiles.find((p: any) => p.templateId === this.selectedTemplateId);
  }

  canExtractManual(): boolean {
    return this.files.length > 0
      && this.selectedTemplateIds.length > 0
      && this.files.some(f => f.pipelineStatus === 'waiting')
      && !this.processing;
  }

  async extractManual() {
    if (!this.canExtractManual()) return;
    this.processing = true;
    this.processedCount = 0;
    this.error = '';
    this.pipelineStartTime = Date.now();

    const pending = this.files.filter(f => f.pipelineStatus === 'waiting');
    const templateIds = this.selectedTemplateIds;

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      this.currentFileIndex = this.files.indexOf(item);

      // Step 1: Classify (using selected templates only)
      this.currentStep = 'Classifying';
      item.pipelineStatus = 'classifying';
      item.classifyStatus = 'processing';

      try {
        const res = await this.aiService.classifyDocument(item.file, templateIds).toPromise();
        item.classifyResult = res.data;
        item.classifyStatus = 'done';
        item.confidence = res.data.confidence || 0;

        if (res.data.status === 'NO_MATCH') {
          item.selectedTemplateId = undefined;
          item.selectedTemplateName = undefined;
          item.pipelineStatus = 'needs_review';
          item.extractStatus = 'skipped';
          item.saveStatus = 'skipped';
          item.processedAt = new Date();
          this.processedCount++;
          continue;
        }

        item.selectedTemplateId = res.data.matchedTemplateId;
        item.selectedTemplateName = res.data.matchedTemplateName;

        if (item.confidence < 0.70) {
          item.pipelineStatus = 'needs_review';
          item.extractStatus = 'skipped';
          item.saveStatus = 'skipped';
          item.processedAt = new Date();
          this.processedCount++;
          continue;
        }
      } catch (err: any) {
        item.classifyError = err.error?.message || 'Classification failed';
        item.classifyStatus = 'error';
        item.pipelineStatus = 'error';
        item.processedAt = new Date();
        this.processedCount++;
        continue;
      }

      // Step 2: Extract
      this.currentStep = 'Extracting';
      item.pipelineStatus = 'extracting';
      item.extractStatus = 'processing';

      try {
        const res = await this.aiService.extractFields(
          item.file, item.selectedTemplateId!, item.selectedTemplateName!
        ).toPromise();
        item.extractResult = res.data;
        item.extractStatus = 'done';
      } catch (err: any) {
        item.extractError = err.error?.message || 'Extraction failed';
        item.extractStatus = 'error';
        item.pipelineStatus = 'error';
        item.processedAt = new Date();
        this.processedCount++;
        continue;
      }

      // Step 3: Index
      this.currentStep = 'Saving';
      item.pipelineStatus = 'saving';
      item.saveStatus = 'processing';

      try {
        const res = await this.aiService.saveDocument(
          item.file, item.selectedTemplateId!, item.selectedTemplateName!,
          item.extractResult.extractedFields
        ).toPromise();
        item.saveStatus = 'done';
        item.savedFileId = res?.data?.fileId;
        item.pipelineStatus = 'done';
      } catch (err: any) {
        item.saveError = err.error?.message || 'Failed to save';
        item.saveStatus = 'error';
        item.pipelineStatus = 'error';
      }

      item.processedAt = new Date();
      this.processedCount++;
    }

    this.processing = false;
    this.currentFileIndex = -1;
    this.currentStep = '';
    this.showPipelineSummary();
  }

  // --- UI Helpers ---

  toggleExpand(index: number) {
    this.expandedIndex = this.expandedIndex === index ? null : index;
  }

  openDetailModal(index: number) {
    const gridFiles = this.getGridFiles();
    this.detailModalFile = gridFiles[index] || null;
    this.showDetailModal = !!this.detailModalFile;
  }

  closeDetailModal() {
    this.showDetailModal = false;
    this.detailModalFile = null;
  }

  getProcessedFiles(): UploadFile[] {
    return this.files.filter(f => f.pipelineStatus !== 'waiting');
  }

  getGridFiles(): UploadFile[] {
    return this.files.filter(f =>
      f.pipelineStatus === 'done' || f.pipelineStatus === 'error' || f.pipelineStatus === 'needs_review'
    );
  }

  getCurrentFile(): UploadFile | null {
    if (this.currentFileIndex >= 0 && this.currentFileIndex < this.files.length) {
      return this.files[this.currentFileIndex];
    }
    return null;
  }

  getOverallProgress(): number {
    if (this.files.length === 0) return 0;
    return Math.round((this.processedCount / this.files.length) * 100);
  }

  getConfidencePercent(confidence: number): number {
    return Math.round((confidence || 0) * 100);
  }

  getConfidenceClass(confidence: number): string {
    if (confidence >= 0.7) return 'success';
    if (confidence >= 0.4) return 'warning';
    return 'danger';
  }

  getStatusLabel(item: UploadFile): string {
    switch (item.pipelineStatus) {
      case 'waiting': return 'Waiting';
      case 'classifying': return 'Classifying...';
      case 'extracting': return 'Extracting...';
      case 'saving': return 'Saving...';
      case 'done': return 'Completed';
      case 'needs_review': return 'Needs Review';
      case 'error': return 'Failed';
      default: return '';
    }
  }

  getStatusClass(item: UploadFile): string {
    switch (item.pipelineStatus) {
      case 'done': return 'status-success';
      case 'needs_review': return 'status-warning';
      case 'error': return 'status-danger';
      case 'classifying':
      case 'extracting':
      case 'saving': return 'status-processing';
      default: return 'status-idle';
    }
  }

  getFileIcon(name: string): string {
    if (name.endsWith('.pdf')) return 'fa-file-pdf';
    return 'fa-file-image';
  }

  getExtractedFieldKeys(result: any): string[] {
    if (!result?.extractedFields) return [];
    return Object.keys(result.extractedFields);
  }

  // --- Profile Icon Mapping ---

  getProfileIcon(name: string): string {
    if (!name) return 'file';
    const n = name.toLowerCase();
    if (n.includes('invoice') || n.includes('bill'))     return 'file-invoice';
    if (n.includes('purchase') || n.includes('order'))   return 'cart-shopping';
    if (n.includes('receipt'))                            return 'receipt';
    if (n.includes('id') || n.includes('identity') || n.includes('nic')) return 'id-card';
    if (n.includes('vehicle') || n.includes('car') || n.includes('license')) return 'car';
    if (n.includes('birth'))                              return 'baby';
    if (n.includes('bank') || n.includes('financial'))   return 'building-columns';
    if (n.includes('deed') || n.includes('land') || n.includes('property')) return 'landmark';
    if (n.includes('passport') || n.includes('visa'))    return 'passport';
    if (n.includes('insurance') || n.includes('policy')) return 'shield-halved';
    if (n.includes('medical') || n.includes('health'))   return 'file-medical';
    return 'file';
  }

  // --- Browse Files ---

  browseFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.png,.jpg,.jpeg,.tiff,.tif,.pdf';
    input.onchange = (e: Event) => {
      this.ngZone.run(() => this.onFileSelected(e));
    };
    input.click();
  }

  // --- Review helpers ---

  getReviewableFiles(): UploadFile[] {
    return this.files.filter(f => f.pipelineStatus === 'needs_review');
  }

  onReviewProfileChange(item: UploadFile, templateId: number) {
    const p = this.profiles.find((pr: any) => pr.templateId === templateId);
    if (p) {
      item.selectedTemplateId = templateId;
      item.selectedTemplateName = p.templateName;
    }
  }

  async retryWithProfile(item: UploadFile) {
    if (!item.selectedTemplateId || item.pipelineStatus !== 'needs_review') return;

    // Extract
    item.extractStatus = 'processing';
    item.pipelineStatus = 'extracting';
    try {
      const res = await this.aiService.extractFields(
        item.file, item.selectedTemplateId!, item.selectedTemplateName!
      ).toPromise();
      item.extractResult = res.data;
      item.extractStatus = 'done';
    } catch (err: any) {
      item.extractError = err.error?.message || 'Extraction failed';
      item.extractStatus = 'error';
      item.pipelineStatus = 'error';
      return;
    }

    // Save
    item.saveStatus = 'processing';
    item.pipelineStatus = 'saving';
    try {
      const res = await this.aiService.saveDocument(
        item.file, item.selectedTemplateId!, item.selectedTemplateName!,
        item.extractResult.extractedFields
      ).toPromise();
      item.saveStatus = 'done';
      item.savedFileId = res?.data?.fileId;
      item.pipelineStatus = 'done';
    } catch (err: any) {
      item.saveError = err.error?.message || 'Failed to save';
      item.saveStatus = 'error';
      item.pipelineStatus = 'error';
    }

    // Update summary
    this.summary = {
      total: this.files.length,
      success: this.files.filter(f => f.pipelineStatus === 'done').length,
      needsReview: this.files.filter(f => f.pipelineStatus === 'needs_review').length,
      failed: this.files.filter(f => f.pipelineStatus === 'error').length,
      timeTaken: this.summary?.timeTaken || ''
    };
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
}
