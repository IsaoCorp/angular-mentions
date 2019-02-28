
import {switchMap, distinctUntilChanged, debounceTime} from 'rxjs/operators';
import { Component, OnInit } from '@angular/core';
import { Http } from '@angular/http';

import { Observable ,  Subject } from 'rxjs';






@Component({
  selector: 'app-demo-async',
  templateUrl: './demo-async.component.html'
})
export class DemoAsyncComponent implements OnInit {
  httpItems: Observable<any[]>;
  private searchTermStream = new Subject();
  ngOnInit() {
    this.httpItems = this.searchTermStream.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((term: string) => this.getItems(term)));
  }
  search(term: string) {
    this.searchTermStream.next(term);
  }

  // this should be in a separate demo-async.service.ts file
  constructor(private http: Http) { }
  getItems(term): Promise<any[]> {
    console.log('getItems:', term);
    // return this.http.get('api/names') // get all names
    // return this.http.get('api/objects?label='+term) // get filtered names
    return this.http.get('https://reqres.in/api/users?limit=30&label=' + term) // get filtered names
               .toPromise()
               .then(response => response.json().data)
               .then(data => {console.log(data); return data})
               .catch(this.handleError);
  }
  handleError(e) {
    console.log(e);
  }

  selectedMention(item: Object) {
    console.log(item);
  }
}
