import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AiService {

  private baseUrl = `${environment.aiServiceUrl}/api/v1/ai`;

  constructor(private http: HttpClient) {}

  getTemplates(): Observable<any> {
    return this.http.get(`${this.baseUrl}/templates/list`);
  }

  getProfiles(): Observable<any> {
    return this.http.get(`${this.baseUrl}/templates/profiles`);
  }

  generateProfile(file: File, templateId: number, templateName: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('templateId', templateId.toString());
    formData.append('templateName', templateName);
    return this.http.post(`${this.baseUrl}/templates/profile`, formData);
  }

  classifyDocument(file: File, templateIds?: number[]): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (templateIds && templateIds.length > 0) {
      templateIds.forEach(id => formData.append('templateIds', id.toString()));
    }
    return this.http.post(`${this.baseUrl}/classify`, formData);
  }

  extractFields(file: File, templateId: number, templateName: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('templateId', templateId.toString());
    formData.append('templateName', templateName);
    return this.http.post(`${this.baseUrl}/extract`, formData);
  }

  saveDocument(file: File, templateId: number, templateName: string, extractedFields: Record<string, string>): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('templateId', templateId.toString());
    formData.append('templateName', templateName);
    formData.append('extractedFields', JSON.stringify(extractedFields));
    return this.http.post(`${this.baseUrl}/save-document`, formData);
  }

  sendToPending(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.baseUrl}/send-to-pending`, formData);
  }
}
