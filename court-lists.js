const Highland = require('highland')
const Request = require('request')
const Cheerio = require('cheerio')
const FS = require('fs')
const CSVWriter = require('csv-write-stream')

const http = Highland.wrapCallback((location, callback) => {
    Request(location, (error, response) => {
        const failure = error ? error : (response.statusCode >= 400) ? new Error(response.statusCode) : null
        callback(failure, response)
    })
})

const location = 'http://xhibit.justice.gov.uk/xhibit/court_lists.htm'

function court(response) {
    const document = Cheerio.load(response.body)
    const courts = document('#content-column li a').get().map(entry => {
        return 'http://xhibit.justice.gov.uk/xhibit/' + Cheerio(entry).attr('href')
    })
    return Array.from(new Set(courts)) // remove duplicates
}

function listing(response) {
    const document = Cheerio.load(response.body)
    const location = document('h1 + h2').text()
    const tableElements = document('table').get()
    const tableHeadings = document('h2:not(:first-of-type)').get().map(heading => Cheerio(heading).text())
    const tableHeadingsAll = tableHeadings.length === tableElements.length
          ? tableHeadings
          : [''].concat(tableHeadings)
    return tableElements.map((table, i) => {
        return Cheerio.load(table)('tr:not(:first-of-type)').get().map(courtData => {
            const court = Cheerio.load(courtData)
            const currentStatus = court('td:nth-of-type(4)').text().trim().replace(/\n/g, '')
            return {
                location: tableHeadingsAll[i] === '' ? location : location + ': ' + tableHeadingsAll[i],
                lastUpdated: document('h2 + p').text(),
                court: court('td:nth-of-type(1)').text().trim(),
                caseNumbers: court('td:nth-of-type(2)').html().split('<br>').filter(x => x !== '\n').join(', '),
                name: court('td:nth-of-type(3)').html().replace(/ +/g, ' ').split('<br>').filter(x => x !== '\n').map(x => x.trim()).join(', '),
                currentStatus: currentStatus === '-  No Information To Display -' ? '' : currentStatus
            }
        })
    })
}

Highland([location])
    .flatMap(http)
    .flatMap(court)
    .flatMap(http)
    .flatMap(listing)
    .flatten()
    .errors(e => console.log(e.stack))
    .through(CSVWriter())
    .pipe(FS.createWriteStream('court-lists.csv'))
