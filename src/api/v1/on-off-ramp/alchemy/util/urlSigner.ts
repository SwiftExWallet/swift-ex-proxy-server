import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { HttpRequestMethod } from '../../../common/enums/httpRequest.enum';

@Injectable()
export class UrlSigner {
  private readonly logger = new Logger(UrlSigner.name);
  constructor() {}

  apiSign(
    timestamp: string,
    method: string,
    requestUrl: string,
    body: any,
    secretKey: string,
  ): string {
    const content =
      timestamp +
      method.toUpperCase() +
      this.getPath(requestUrl) +
      this.getJsonBody(body);
    return crypto
      .createHmac('sha256', secretKey)
      .update(content, 'utf8')
      .digest('base64');
  }

  private getPath(requestUrl: string): string {
    const uri = new URL(requestUrl);
    const path = uri.pathname;
    const params = Array.from(uri.searchParams.entries());

    if (params.length === 0) return path;

    const sortedParams = [...params].sort(([a], [b]) => a.localeCompare(b));
    const queryString = sortedParams
      .map(([key, val]) => `${key}=${val}`)
      .join('&');
    return `${path}?${queryString}`;
  }

  private getJsonBody(body: any): string {
    let map: Record<string, any>;

    if (typeof body === 'string') {
      try {
        map = JSON.parse(body);
      } catch {
        map = {};
      }
    } else if (typeof body === 'object') {
      map = body || {};
    } else {
      map = {};
    }

    if (Object.keys(map).length === 0) {
      return '';
    }

    map = this.removeEmptyKeys(map);
    map = this.sortObject(map) as Record<string, any>;

    return JSON.stringify(map);
  }

  private removeEmptyKeys(map: Record<string, any>): Record<string, any> {
    const retMap: Record<string, any> = {};
    for (const [key, value] of Object.entries(map)) {
      if (value !== null && value !== '') {
        retMap[key] = value;
      }
    }
    return retMap;
  }

  private sortObject(obj: any): any {
    if (Array.isArray(obj)) {
      return this.sortList(obj);
    } else if (typeof obj === 'object') {
      return this.sortMap(obj);
    }
    return obj;
  }

  private sortMap(map: Record<string, any>): Record<string, any> {
    const sortedMap = new Map(
      Object.entries(this.removeEmptyKeys(map)).sort(([aKey], [bKey]) =>
        aKey.localeCompare(bKey),
      ),
    );

    for (const [key, value] of sortedMap.entries()) {
      if (typeof value === 'object') {
        sortedMap.set(key, this.sortObject(value));
      }
    }

    return Object.fromEntries(sortedMap.entries());
  }

  private sortList(list: any[]): any[] {
    const objectList: any[] = [];
    const intList: number[] = [];
    const floatList: number[] = [];
    const stringList: string[] = [];
    const jsonArray: object[] = [];

    for (const item of list) {
      if (typeof item === 'object') {
        jsonArray.push(item);
      } else if (Number.isInteger(item)) {
        intList.push(item);
      } else if (typeof item === 'number') {
        floatList.push(item);
      } else if (typeof item === 'string') {
        stringList.push(item);
      } else {
        intList.push(item);
      }
    }

    intList.sort((a, b) => a - b);
    floatList.sort((a, b) => a - b);
    stringList.sort();

    objectList.push(...intList, ...floatList, ...stringList, ...jsonArray);
    list.length = 0;
    list.push(...objectList);

    const retList: any[] = [];
    for (const item of list) {
      if (typeof item === 'object') {
        retList.push(this.sortObject(item));
      } else {
        retList.push(item);
      }
    }
    return retList;
  }

  signPayload(
    timestamp: string,
    apiPayload: any,
    method: HttpRequestMethod,
    requestUrl: string,
  ): string {
    try {
      return this.apiSign(
        timestamp,
        method,
        requestUrl,
        apiPayload,
        process.env.ALCHEMY_PAY_SECRET as string,
      );
    } catch (error: any) {
      throw new InternalServerErrorException(
        `sign payload failed: ${error.message}`,
      );
    }
  }
}
