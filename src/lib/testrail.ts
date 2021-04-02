const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const TestRailLogger = require('./testrail.logger');
const TestRailCache = require('./testrail.cache');
import { TestRailOptions, TestRailResult } from './testrail.interface';

export class TestRail {
  private base: String;
  private runId: Number;
  private includeAll: Boolean = true;
  private caseIds: Number[] = [];
  private retries: number;

  constructor(private options: TestRailOptions) {
    this.base = `${options.host}/index.php?/api/v2`;
    this.runId;
  }

  public getCases () {
    let url = `${this.base}/get_cases/${this.options.projectId}&suite_id=${this.options.suiteId}`
    if (this.options.groupId) {
      url += `&section_id=${this.options.groupId}`
    }
    if (this.options.filter) {
      url += `&filter=${this.options.filter}`
    }
    return axios({
      method:'get',
      url: url,
      headers: { 'Content-Type': 'application/json' }, 
      auth: {
          username: this.options.username,
          password: this.options.password
      } 
    })
    .then(response => response.data.map(item =>item.id))
    .catch(error => console.error(error));
  }

  public async createRun (name: string, description: string, suiteId: number) {
    if (this.options.includeAllInTestRun === false){
      this.includeAll = false;
      this.caseIds =  await this.getCases();
    }  
    axios({
      method: 'post',
      url: `${this.base}/add_run/${this.options.projectId}`,
      headers: { 'Content-Type': 'application/json' },
      auth: {
        username: this.options.username,
        password: this.options.password,
      },
      data: JSON.stringify({
        suite_id: suiteId,
        name,
        description,
        include_all: this.includeAll,
        case_ids: this.caseIds
      }),
    })
    .then(response => {
        this.runId = response.data.id;
        // cache the TestRail Run ID
        TestRailCache.store('runId', this.runId);
    })
    .catch(error => console.error(error));
  }

  public deleteRun() {
    this.runId = TestRailCache.retrieve('runId');
    axios({
      method: 'post',
      url: `${this.base}/delete_run/${this.runId}`,
      headers: { 'Content-Type': 'application/json' },
      auth: {
        username: this.options.username,
        password: this.options.password,
      },
    }).catch(error => console.error(error));
  }

  public publishResults(results: TestRailResult[]) {
    this.runId = TestRailCache.retrieve('runId');
    return axios({
      method: 'post',
      url: `${this.base}/add_results_for_cases/${this.runId}`,
      headers: { 'Content-Type': 'application/json' },
      auth: {
        username: this.options.username,
        password: this.options.password,
      },
      data: JSON.stringify({ results }),
    })
    .then(response => {
      return response.data
    })
    .catch(error => { 
      return console.error(error); 
    });
  }

  public uploadAttachment (resultId, path) {
    const form = new FormData();
    form.append('attachment', fs.createReadStream(path));

    return axios({
      method: 'post',
      url: `${this.base}/add_attachment_to_result/${resultId}`,
      headers: { ...form.getHeaders() },
      auth: {
        username: this.options.username,
        password: this.options.password,
      },
      data: form,
    })
  }

  // This function will attach failed screenshot on each test result(comment) if founds it
  public uploadScreenshots (caseId, resultId) {
    const SCREENSHOTS_FOLDER_PATH = path.join(__dirname, 'cypress/screenshots');

    fs.readdir(SCREENSHOTS_FOLDER_PATH, (err, files) => {
      if (err) {
        return console.log('Unable to scan screenshots folder: ' + err);
      } 

      files.forEach(file => {
        if (file.includes(`C${caseId}`) && /(failed|attempt)/g.test(file)) {
          try {
            this.uploadAttachment(resultId, SCREENSHOTS_FOLDER_PATH + file)
          } catch (err) {
            console.log('Screenshot upload error: ', err)
          }
        }
      });
    });
  };

  public closeRun() {
    this.runId = TestRailCache.retrieve('runId');
    axios({
      method: 'post',
      url: `${this.base}/close_run/${this.runId}`,
      headers: { 'Content-Type': 'application/json' },
      auth: {
        username: this.options.username,
        password: this.options.password,
      },
    })
    .then(() => {
        TestRailLogger.log('Test run closed successfully');
    })
    .catch(error => console.error(error));
  }
}
